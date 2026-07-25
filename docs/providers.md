# Implementing providers

`StudioConfig` (`packages/studio/src/config/types.ts`) takes small provider interfaces for the parts of the pipeline that are inherently host-specific: how you charge users, how you moderate prompts, where files live, and how you authenticate requests. Two ship with working defaults (`freeBilling`, `allowAllModeration`, `r2Storage`); the rest are host-owned by design — the package never bundles an auth library or a payment processor.

This doc covers each interface's contract and works through two provider sketches end to end: a ledger-style `BillingProvider` and a strict LLM `ModerationProvider`.

## BillingProvider

```ts
interface BillingProvider {
  costFor(modelId: string): number;
  videoCost(seconds: number): number;
  getBalance(userId: string): Promise<number | null>; // null = unlimited → all coin UI hidden
  charge(userId: string, amount: number, ref: string): Promise<"ok" | "insufficient">; // MUST be idempotent by ref
  refund(userId: string, ref: string): Promise<void>; // MUST be safe to call twice and for unknown refs
  topUpUrl?: string; // absent = no Buy CTA
  coinName?: string; // display label, default "coins"
}
```

Contract notes, straight from the interface's own comments and how the task layer actually calls it (`packages/studio/src/tasks/generate-image.ts`, `generate-video.ts`):

- **`ref` is the RunPod job id.** The task layer calls `charge(userId, priceCoins, jobId)` only *after* the job id is durably attached to the generation row — so if the process crashes between charging and attaching, `onFailure`'s refund path (which reads the row's `runpodJobId` back out) can never find a ref to refund. Your `charge`/`refund` need no other idempotency key; the RunPod job id already is one.
- **Idempotent by `ref`.** A retried `charge` call with the same `ref` must not double-charge, and a `refund` call for a `ref` that was never charged (or already refunded) must be a safe no-op — the task layer calls `refund` unconditionally on some failure paths without first checking whether a charge happened.
- **`getBalance` returning `null` means unlimited.** The client derives `StudioClientConfig.features` and the balance UI entirely from whether this resolves non-null — a provider that always returns `null` (like `freeBilling`) gets a UI with no coin badge, no cost labels, and no Buy CTA anywhere, automatically.
- **`charge` with `amount === 0` must succeed with no side effects.** This is the fast path for free models/generations under a paid provider — don't reject a zero-amount charge or treat it as "insufficient" just because the user's balance happens to be zero too.
- **`topUpUrl` absent = no Buy CTA.** Purely a UI toggle; leave it unset if you have nowhere to send users to buy more.

### Worked example: a ledger-style sketch

```ts
import { and, eq, sql } from "drizzle-orm";
import type { BillingProvider } from "@two-71/studio";
import { db } from "@/lib/db";
import { ledgerEntry, userBalance } from "@/lib/db/schema";

const COST_PER_IMAGE: Record<string, number> = {
  "my-model": 5,
};
const COST_PER_VIDEO_SECOND = 2;

export const ledgerBilling: BillingProvider = {
  costFor: (modelId) => COST_PER_IMAGE[modelId] ?? 0,
  videoCost: (seconds) => seconds * COST_PER_VIDEO_SECOND,
  coinName: "credits",
  topUpUrl: "/billing",

  async getBalance(userId) {
    const row = await db.query.userBalance.findFirst({
      where: eq(userBalance.userId, userId),
    });
    return row?.balance ?? 0;
  },

  async charge(userId, amount, ref) {
    if (amount === 0) {
      return "ok"; // fast path — no ledger row needed for a free generation
    }
    return await db.transaction(async (tx) => {
      // unique(userId, ref) on ledgerEntry makes this idempotent: a retried
      // charge with the same ref hits the conflict branch and returns "ok"
      // without moving money twice.
      const existing = await tx.query.ledgerEntry.findFirst({
        where: and(eq(ledgerEntry.userId, userId), eq(ledgerEntry.ref, ref)),
      });
      if (existing) {
        return "ok";
      }
      const balance = await tx.query.userBalance.findFirst({
        where: eq(userBalance.userId, userId),
      });
      if (!balance || balance.balance < amount) {
        return "insufficient";
      }
      await tx
        .update(userBalance)
        .set({ balance: balance.balance - amount })
        .where(eq(userBalance.userId, userId));
      await tx.insert(ledgerEntry).values({ userId, ref, amount: -amount });
      return "ok";
    });
  },

  async refund(userId, ref) {
    await db.transaction(async (tx) => {
      const charge = await tx.query.ledgerEntry.findFirst({
        where: and(eq(ledgerEntry.userId, userId), eq(ledgerEntry.ref, ref)),
      });
      if (!charge || charge.amount >= 0) {
        return; // never charged, or already refunded — safe no-op either way
      }
      await tx
        .update(userBalance)
        .set({ balance: sql`${userBalance.balance} + ${-charge.amount}` })
        .where(eq(userBalance.userId, userId));
      // Flip the sign in place rather than inserting a second row, so a
      // second refund call for the same ref sees amount >= 0 and no-ops.
      await tx
        .update(ledgerEntry)
        .set({ amount: -charge.amount })
        .where(and(eq(ledgerEntry.userId, userId), eq(ledgerEntry.ref, ref)));
    });
  },
};
```

The open default is `freeBilling` (`packages/studio/src/config/defaults.ts`): `costFor`/`videoCost` always `0`, `charge` always `"ok"`, `refund` a no-op, `getBalance` always `null`.

## ModerationProvider

```ts
type ModerationResult =
  | { action: "allow"; rewritten?: string }
  | { action: "block"; reason?: string };

interface ModerationProvider {
  check(input: { prompt: string; userId: string }): Promise<ModerationResult>;
}
```

Contract notes, from how `generate-request.ts` (the orchestrator task) actually calls it:

- **Called once per generate request**, concurrently with the enhance step, over the user's original typed prompt — not the enhanced one. Moderation gates the user's intent; the enhancer runs over an already-moderated prompt (see [PromptSpec / PromptRunner](#promptspec--promptrunner) below).
- **Fail-closed.** `check` rejecting or throwing is treated exactly like any other task error: the orchestrator catches it, marks every row in the batch `failed` with reason `moderation_unavailable`, and stops — it does **not** fall back to allowing the prompt through. If your moderation call can fail (network error, upstream 5xx), let that surface as a thrown error rather than swallowing it into an `"allow"`.
- **`{ action: "block" }` short-circuits generation** — rows are marked failed with reason `content_policy` and no RunPod job is ever submitted or charged.
- **`{ action: "allow", rewritten }` swaps the prompt.** If you rewrite instead of blocking, the rewritten text is what actually gets sent to RunPod (and is what the enhancer's output is discarded in favor of — see the note above); the original is preserved separately as `originalPrompt` on the row.
- **Block audit is your responsibility.** The package has no audit table of its own — if you need a record of what got blocked and why, write it inside your `check` implementation (or from `notify`'s `"moderation-blocked"` event) before returning.

The open default is `allowAllModeration`: always resolves `{ action: "allow" }`.

### Worked example: a strict LLM moderation sketch

Generic OpenAI-compatible endpoint — point `baseUrl`/`apiKey`/`model` at whatever provider you use; nothing here is pinned to a specific vendor.

```ts
import type { ModerationProvider } from "@two-71/studio";

interface ModerationLLMConfig {
  baseUrl: string; // e.g. an OpenAI-compatible /v1 endpoint
  apiKey: string;
  model: string;
}

export function llmModeration(cfg: ModerationLLMConfig): ModerationProvider {
  return {
    async check({ prompt }) {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Classify the user prompt for an image-generation tool. ' +
                'Respond with JSON only: {"action":"allow"|"block","reason"?:string}. ' +
                'Block anything depicting real identifiable people without consent, ' +
                'illegal content, or content sexualizing minors.',
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      // Fail closed: a non-2xx or unparseable response throws, which the
      // orchestrator treats as a moderation failure and fails the batch
      // rather than letting an unmoderated prompt through.
      if (!res.ok) {
        throw new Error(`moderation call failed: ${res.status}`);
      }
      const body = await res.json();
      const parsed = JSON.parse(body.choices[0].message.content) as {
        action: "allow" | "block";
        reason?: string;
      };
      return parsed;
    },
  };
}
```

## StorageAdapter

```ts
interface StorageAdapter {
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getBase64(key: string): Promise<string>;
  publicUrl(key: string): string;
  keyFromPublicUrl(url: string): string | null; // video route needs the reverse mapping
}
```

`keyFromPublicUrl` exists because the video route accepts a source image by its public URL and needs to map it back to a storage key to re-download the bytes for RunPod. The package ships `r2Storage(env)` (`packages/studio/src/config/r2-storage.ts`) against any S3-compatible bucket (Cloudflare R2, or plain S3) — pass `accountId`/`accessKeyId`/`secretAccessKey`/`bucket`/`publicUrl` and you likely don't need a custom implementation unless you're on a non-S3-compatible store.

## AuthAdapter

```ts
interface AuthAdapter {
  getSession(req: Request): Promise<{ userId: string } | null>;
}
```

The package never bundles an auth library — this is the entire surface it needs from yours. Route handlers created by `createStudioHandlers` call this once per request and respond `401` on `null`. A [better-auth](https://better-auth.com) wiring (what `apps/demo` uses) looks like:

```ts
const authAdapter: AuthAdapter = {
  async getSession(req) {
    const session = await auth.api.getSession({ headers: req.headers });
    return session ? { userId: session.user.id } : null;
  },
};
```

## PromptSpec / PromptRunner

```ts
interface PromptSpec {
  system: string;
  model: string;
  baseUrl: string; // any OpenAI-compatible endpoint
  apiKey: string;
  temperature?: number;
}

interface EnhanceContext {
  referenceImage?: string;
  poseImage?: string;
  triggerWords?: string[];
}

interface PromptRunner {
  enhance?: (prompt: string, context: EnhanceContext) => Promise<string>;
  title?: (prompt: string) => Promise<string | null>;
}
```

`StudioConfig.prompts` (`PromptSpec`) describes *which* model/endpoint you'd use, but the task layer doesn't call it directly — the actual invocation is `StudioConfig.promptRunner`. Supply `promptRunner.enhance`/`.title` as plain async functions (wrapping a Vercel AI SDK call, a direct `fetch`, or anything else) that do the LLM call themselves. If you configure `prompts` for documentation/UI purposes but don't wire `promptRunner`, enhancement and titling silently fall back to their no-op defaults below — `promptRunner` is what actually turns the feature on.

- **`promptRunner.enhance` absent** → the enhancement toggle is hidden in the UI (`StudioClientConfig.features.enhance` is derived from `Boolean(config.prompts?.enhance)`), and the orchestrator uses the original prompt unchanged.
- **`promptRunner.title` absent** → generated titles fall back to a prompt excerpt instead of an LLM call (`generate-title.ts`).
- `EnhanceContext.triggerWords` is resolved by the orchestrator from whichever of your configured models' `loras` match the request's selected LoRA ids — your `enhance` function doesn't need to look those up itself.

## notify

```ts
type GenerationEvent =
  | { type: "created"; userId: string; generationId: string }
  | { type: "completed"; generation: GenerationSummary }
  | { type: "failed"; generation: GenerationSummary; reason: string }
  | { type: "moderation-blocked"; userId: string; prompt: string };

notify?: (event: GenerationEvent) => Promise<void>;
```

Fired from the `notify-generation` sidecar task (fire-and-forget — it never blocks the run the UI is watching) on completion, and from other task failure paths. Omit it entirely for no notifications; a Discord/Slack webhook wrapper is a natural fit:

```ts
export const discordNotify: StudioConfig["notify"] = async (event) => {
  if (event.type !== "completed") {
    return;
  }
  await fetch(process.env.DISCORD_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `Generation ${event.generation.id} finished (${event.generation.mediaType}, ${event.generation.priceCoins} coins).`,
    }),
  });
};
```
