/**
 * ErrorState — surfaces an API failure visibly (UI_DESIGN_SPEC.md §C.12),
 * mapping the Phase C `{error:{code,message,status}}` contract to safe copy.
 *
 * Security: for AUTH_FAILED / FORBIDDEN / INTERNAL we NEVER echo the server
 * message — generic copy + machine code only. `onRetry` re-calls the fetch.
 */
import { Button } from "@/components/ui/Button";

/** Decoded API failure (see src/lib/api-client.ts decodeApiError). */
export type ApiFailure = { code: string; message: string; status: number };

const SENSITIVE_CODES = new Set(["AUTH_FAILED", "FORBIDDEN", "INTERNAL"]);

/** Pick the safe, human copy for a known failure (spec C.12 mapping). */
export function errorCopy(failure: ApiFailure): { heading: string; detail: string } {
  switch (failure.code) {
    case "AUTH_FAILED":
    case "FORBIDDEN":
      return { heading: "Session expired — please sign in.", detail: "Your session has ended. Sign in again to continue viewing live data." };
    case "NOT_FOUND":
      return { heading: "This module has no data yet.", detail: failure.message };
    case "ADAPTER_FAILED":
      return { heading: "Google Sheets is temporarily unavailable.", detail: "Please try again in a moment." };
    case "INTERNAL":
      return { heading: "Unable to load this data.", detail: "An unexpected error occurred. Please try again." };
    default:
      return { heading: "Unable to load this data.", detail: SENSITIVE_CODES.has(failure.code) ? failure.code : failure.message };
  }
}

export interface ErrorStateProps {
  failure: ApiFailure;
  onRetry?: () => void;
}

export function ErrorState({ failure, onRetry }: ErrorStateProps) {
  const { heading, detail } = errorCopy(failure);
  return (
    <div
      role="alert"
      className="rounded-[16px] border border-danger/30 bg-white/60 p-5"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-danger">⚠</span>
        <h3 className="text-[1rem] font-bold text-danger">{heading}</h3>
      </div>
      <p className="mt-2 text-[0.86rem] text-muted">{detail}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          Retry
        </Button>
      ) : null}
    </div>
  );
}