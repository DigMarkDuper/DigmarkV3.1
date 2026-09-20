/**
 * LoadingState — skeleton loader matching the shape it precedes
 * (UI_DESIGN_SPEC.md §C.13). Always aria-busy; never a raw blank.
 */
import { type ReactNode } from "react";

const SUFFIX = "block rounded bg-muted/20 animate-pulse";

function Card(): ReactNode {
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className={`h-3 w-24 ${SUFFIX}`} />
      <div className={`h-6 w-2/5 ${SUFFIX}`} />
    </div>
  );
}

function Row(): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-4 w-28 ${SUFFIX}`} />
      <div className={`h-4 w-20 ${SUFFIX}`} />
    </div>
  );
}

function Stat(): ReactNode {
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className={`h-2.5 w-20 ${SUFFIX}`} />
      <div className={`h-8 w-24 ${SUFFIX}`} />
    </div>
  );
}

function Inline(): ReactNode {
  return <div className={`h-4 w-40 ${SUFFIX}`} />;
}

function Table(): ReactNode {
  const cells = ["w-1/3", "w-1/4", "w-1/5", "w-1/6"];
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex gap-3">
        {cells.map((w, i) => <div key={i} className={`h-3 ${w} ${SUFFIX}`} />)}
      </div>
      {[0, 1, 2, 3, 4].map((r) => (
        <div key={r} className="flex gap-3">
          {cells.map((w, i) => <div key={i} className={`h-4 ${w} ${SUFFIX}`} />)}
        </div>
      ))}
    </div>
  );
}

const VARIANTS = { card: Card, row: Row, stat: Stat, table: Table, inline: Inline };

export type LoadingVariant = "card" | "row" | "stat" | "table" | "inline";

export function LoadingState({ variant = "card" }: { variant?: LoadingVariant }) {
  const render = VARIANTS[variant] ?? Card;
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="overflow-hidden">
      {render()}
    </div>
  );
}