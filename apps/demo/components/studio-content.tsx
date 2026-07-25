"use client";

// Minimal Studio UI (spec §10 B1.2). The package's "./client" entry currently
// only ships providers (<Studio>, useStudioConfig, useStudioUser — no
// prebuilt gallery/generate components yet), so this app supplies its own
// thin UI directly against the REST routes createStudioHandlers mounts
// (spec §5). Data fetching goes through React Query per the project's
// useEffect ban: no manual fetch-in-effect, no manual poll loop — a
// query-level refetchInterval does both declaratively.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStudioConfig, useStudioUser } from "@two-71/studio/client";
import Image from "next/image";
import type { FormEvent } from "react";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

const STUDIO_API_BASE = "/api/studio";
const GENERATIONS_QUERY_KEY = ["studio-generations"];
const POLL_INTERVAL_MS = 2000;

interface GenerationRow {
  id: string;
  status: string;
  prompt: string;
  title: string | null;
  resultUrls: string[];
  error: string | null;
}

interface GenerationsResponse {
  generations: GenerationRow[];
}

async function fetchGenerations(): Promise<GenerationsResponse> {
  const res = await fetch(`${STUDIO_API_BASE}/generations`);
  if (!res.ok) {
    throw new Error("Failed to load generations");
  }
  return res.json();
}

async function generateRun(input: {
  modelId: string;
  prompt: string;
  ratio: string;
}): Promise<void> {
  const res = await fetch(`${STUDIO_API_BASE}/generate/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelIds: [input.modelId],
      prompt: input.prompt,
      ratio: input.ratio,
      resolutionTier: "Standard",
    }),
  });
  if (!res.ok) {
    const body: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Generation failed to start");
  }
}

async function deleteGenerations(ids: string[]): Promise<void> {
  const res = await fetch(`${STUDIO_API_BASE}/generations`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error("Failed to delete generation");
  }
}

function hasPending(data: GenerationsResponse | undefined): boolean {
  return data?.generations.some((row) => row.status === "pending") ?? false;
}

export function StudioContent() {
  const config = useStudioConfig();
  const user = useStudioUser();
  const model = config.models[0];
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");

  const generationsQuery = useQuery({
    queryKey: GENERATIONS_QUERY_KEY,
    queryFn: fetchGenerations,
    refetchInterval: (query) =>
      hasPending(query.state.data) ? POLL_INTERVAL_MS : false,
  });

  const generateMutation = useMutation({
    mutationFn: generateRun,
    onSuccess: () => {
      setPrompt("");
      queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGenerations,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(model && prompt.trim())) {
      return;
    }
    generateMutation.mutate({
      modelId: model.id,
      prompt: prompt.trim(),
      ratio: model.ratios[0] ?? "1:1",
    });
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  const generations = generationsQuery.data?.generations ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl">
            {config.branding?.siteName ?? "Studio"}
          </h1>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
        <button
          className="text-muted-foreground text-sm underline"
          onClick={handleSignOut}
          type="button"
        >
          Sign out
        </button>
      </header>

      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={handleSubmit}
      >
        <label className="flex flex-col gap-1 text-sm" htmlFor="prompt">
          Prompt
          <textarea
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            id="prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="a scenic mountain landscape, golden hour"
            value={prompt}
          />
        </label>
        {generateMutation.isError && (
          <p className="text-destructive text-sm">
            {generateMutation.error.message}
          </p>
        )}
        <button
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={!(model && prompt.trim()) || generateMutation.isPending}
          type="submit"
        >
          {generateMutation.isPending ? "Generating…" : "Generate"}
        </button>
      </form>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {generations.map((generation) => (
          <GenerationCard
            generation={generation}
            key={generation.id}
            onDelete={() => deleteMutation.mutate([generation.id])}
          />
        ))}
      </section>
    </main>
  );
}

function GenerationCard({
  generation,
  onDelete,
}: {
  generation: GenerationRow;
  onDelete: () => void;
}) {
  const imageUrl = generation.resultUrls[0];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            alt={generation.prompt}
            className="object-cover"
            fill
            src={imageUrl}
            unoptimized
          />
        ) : (
          <span className="flex h-full items-center justify-center px-2 text-center text-muted-foreground text-xs">
            {generation.status === "failed"
              ? (generation.error ?? "Failed")
              : "Generating…"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs" title={generation.prompt}>
          {generation.title ?? generation.prompt}
        </p>
        <button
          className="text-destructive text-xs underline"
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
