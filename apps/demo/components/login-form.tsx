"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ name, email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.push("/studio");
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
      onSubmit={handleSubmit}
    >
      <h1 className="font-semibold text-card-foreground text-lg">
        {mode === "sign-in" ? "Sign in" : "Create an account"}
      </h1>

      {mode === "sign-up" && (
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <button
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {mode === "sign-in" ? "Sign in" : "Sign up"}
      </button>

      <button
        className="text-muted-foreground text-sm underline"
        onClick={() =>
          setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"))
        }
        type="button"
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
