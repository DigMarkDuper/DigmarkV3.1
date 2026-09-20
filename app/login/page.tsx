"use client";
/**
 * Login page (Phase D) — unauthenticated fallback for the Overview auth gate.
 * Submits credentials to POST /api/auth/login (Phase C) and redirects to "/"
 * on success. Uses the design-system Form controls (C.16) + Button (C.14).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson, type ApiFailure } from "@/lib/api-client";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await postJson<{ ok: boolean }>("/api/auth/login", { username, password });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(
        e && typeof e === "object" && "code" in (e as ApiFailure)
          ? (e as ApiFailure)
          : { code: "INTERNAL", message: "Unexpected error.", status: 0 },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1220px] px-4">
      <Topbar />
      <main className="mx-auto mt-16 max-w-[1180px]">
        <div className="mx-auto w-full max-w-md rounded-[20px] border border-border bg-surface p-8 shadow-[var(--dm-shadow)]">
          <h1 className="text-[1.35rem] font-extrabold text-ink">Sign in</h1>
          <p className="mt-1 text-[0.9rem] text-muted">Use your DIGMARK team credentials to open the Command Center.</p>

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextInput id="username" name="username" label="Username" value={username} onInput={setUsername} autoComplete="username" required />
            <TextInput id="password" name="password" label="Password" type="password" value={password} onInput={setPassword} autoComplete="current-password" required />

            {error ? (
              <div role="alert" className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[0.86rem] text-danger">
                {error.code === "AUTH_FAILED" ? "Invalid username or password." : "Unable to sign in — please try again."}
              </div>
            ) : null}

            <Button variant="primary" type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in →"}
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}