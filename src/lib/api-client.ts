/**
 * Thin browser API client (Phase D). The UI consumes ONLY the Phase C API —
 * never Sheets, never metric math (that stays server-side, spec §D.2). This
 * module provides:
 *   - `requestJson` — a fetch wrapper (credentials + error decoding)
 *   - `decodeApiError` — maps a non-2xx response to the {code,message,status}
 *     contract from src/lib/errors.ts (pure + unit-testable)
 *   - `useApi` — a small hook returning {status, data, error, refetch} with the
 *     loading/ready/empty/error lifecycle the spec §D.2 defines.
 */
"use client";
import { useEffect, useState } from "react";

export interface ApiFailure {
  code: string;
  message: string;
  status: number;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; status?: number };
}

/** Decode a non-2xx Response into the standard API failure shape. */
export async function decodeApiError(response: Response): Promise<ApiFailure> {
  let code = "INTERNAL";
  let message = "Unexpected server error.";
  const status = response.status;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // non-JSON body — fall through to defaults.
  }
  return { code, message, status };
}

/** GET a JSON API endpoint; throws an ApiFailure on any non-2xx. */
export async function requestJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw await decodeApiError(res);
  }
  return (await res.json()) as T;
}

/** POST a JSON body; throws an ApiFailure on any non-2xx. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await decodeApiError(res);
  }
  return (await res.json()) as T;
}

/**
 * PATCH a JSON body (Phase E: the Sosmed inline editor saves N changed cells).
 * Body shape for PATCH /api/tables/[key] must be { rowIndex, column, value };
 * the server resolves the column by declared name and rejects non-scalar values.
 * Throws an ApiFailure on any non-2xx.
 */
export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await decodeApiError(res);
  }
  return (await res.json()) as T;
}

/**
 * POST a multipart file upload (Phase E: Ads import). The browser sets the
 * multipart boundary; we never set Content-Type manually. Throws an ApiFailure
 * on any non-2xx.
 */
export async function uploadFile<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Cache-Control": "no-cache" },
    body: form,
  });
  if (!res.ok) {
    throw await decodeApiError(res);
  }
  return (await res.json()) as T;
}

export type ApiStatus = "loading" | "ready" | "empty" | "error";

export interface ApiState<T> {
  status: ApiStatus;
  data?: T;
  error?: ApiFailure;
  /** Re-run the fetch (cache-busting refetch; drives ErrorState.retry). */
  refetch: () => void;
}

/**
 * Small hook wrapping a GET JSON resource (spec §D.2 "single useApi* hook").
 * `emptyWhen` decides the empty vs ready terminal states (default: null data).
 * Resets to "loading" happen in the refetch handler (event context), never
 * synchronously inside the effect body.
 */
export function useApi<T>(path: string, emptyWhen?: (data: T) => boolean): ApiState<T> {
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<ApiStatus>("loading");
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    requestJson<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus(emptyWhen ? (emptyWhen(d) ? "empty" : "ready") : d == null ? "empty" : "ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e && typeof e === "object" && "code" in (e as ApiFailure)
            ? (e as ApiFailure)
            : { code: "INTERNAL", message: "Unexpected client error.", status: 0 },
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce]);

  const refetch = () => {
    setStatus("loading");
    setData(undefined);
    setError(undefined);
    setNonce(nonce + 1);
  };

  return { status, data, error, refetch };
}