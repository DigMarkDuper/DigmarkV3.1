# Quick Insight → Sales Funnel — UI Design Spec (Home)

**File:** `app/page.tsx` (Home) — Quick Insight section revision.
**Verb for the implementer (REX):** implement this spec verbatim.
**Companion (data/mapping contract):** `docs/quick_insight_funnel_data_spec.md` — read it first; this file governs ONLY the rendering/UI, that file governs EVERY numeric value, stage definition, and the scope fence. Where this file and the data spec disagree, the data spec wins.

---

## 1. Scope fence (absolute)

- **CHANGE ONLY** the Quick Insight section: the `<SectionHead title="Quick Insight">` block and its grid inside `app/page.tsx` (the block currently rendering `QuickInsightStat` tiles).
- **UNTOUCHED:** Hero, "Command Center", "Explore Your Workspace" (`WorkspaceSection`), navbar/topbar, drift banner, footer, `Divider`, all other routes, layout, shared components, spacing, `SectionHead`.
- **No chart library.** CSS/HTML only (dependency-free SVG permitted but unnecessary here — this brief uses pure CSS/HTML).
- **No hardcoded business metrics.** Every number arrives from the server payload; the browser never computes business metrics and never touches Sheets.

Implementation approach for the section body: the render is already threaded through three states (`error` / `loading` / ready) in `app/page.tsx`. Keep that state tri-state in place; only the **content** of the ready and loading branches changes (from 4 tiles → 1 funnel card). The error branch stays as the existing `ErrorState`/retry. (See §6.)

---

## 2. Component strategy (repurpose vs new)

**Create ONE new component; do NOT repurpose `QuickInsightStat`.**

- Member variable: `QuickInsightStat.tsx` is a **simple 4-KPI tile** (`label` + one `value`). The funnel card needs a very different structure (header strip + SALES FUNNEL row of 5 stage cards + supporting strip). It is not an evolution of the tile — it is a distinct layout. Keep `QuickInsightStat.tsx` in the repo (harmless, may serve other routes) but **stop importing it in `app/page.tsx`**.

- Create a new component file:
  `D:/digmarkv3.1/src/components/metrics/SalesFunnelCard.tsx`
  (single named export `SalesFunnelCard`). It is a **pure presentational** component: it takes already-formatted strings and booleans as props and renders. It does NO fetching and NO formatting math beyond displaying the passed strings. All derived strings (percentages as strings, counts as strings, "—" placeholders) are computed server-side in the controller per the data spec §"Linear conversion rates" / "Data-access architecture"; the component just renders them.

- Then edit `app/page.tsx`:
  - Remove the `QuickInsightStat` import; add `import { SalesFunnelCard } from "@/components/metrics/SalesFunnelCard";`.
  - Replace the two inner `<div className="grid ...">{tiles}</div>` blocks (loading + ready) with `<SalesFunnelCard … />` renderings (see §6 for exact props).

**Recommended props interface** (contract between the page/controller and the component):

```ts
export interface SalesFunnelStage { name: string; value: string; sub?: string }
export interface SalesFunnelConnector { rate: string } // already-formatted "0.9%" or "—"

export interface SalesFunnelCardProps {
  loading?: boolean;                 // skeleton when true
  stages: SalesFunnelStage[];        // exactly 5: Awareness, Intent, Lead, Daftar, Closing
  connectors: SalesFunnelConnector[]; // exactly 4 rates (between adjacent stages)
  overall?: string;                  // already-formatted overall lead→closing rate, e.g. "4.9%", or "—"
  supports: SalesFunnelStage[];      // 4 supporting metrics: Views, Interaksi, Profile Visit, Ad Spend
}
```

`loading` boolean comes from `metricStatus === "loading"` in the page. When `loading` is true, the component renders skeletons and ignores the stage/connector/support values. See §6.

---

## 3. Card container & header strip

The funnel lives in **one large card**. Keep the `SectionHead` exactly as-is (title "Quick Insight", subtitle "Ringkasan angka penting, live dari data." — `SECTION_SUB` is unchanged and already the correct copy).

Card container (the only new wrapper around everything below, and the direct replacement for the `grid` div):

```tsx
<section
  aria-label="Sales funnel"
  className="mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]"
>
```

- Uses the repo's card recipe (same as `QuickInsightStat` + all metric cards): `rounded-[20px]`, `border border-border`, `bg-surface`, `shadow-[var(--dm-shadow)]`, `backdrop-blur-[10px]`, `saturate-[140%]`, `p-5`.
- **Use `RADII.lg` (20px) and `SHADOWS.base`** conceptually; express via the token utilities shown above (do not hard-code hex). `p-5` keeps the card compact.
- Kept compact by design: no oversized padding, no hero-type visual panel, single-tone `bg-surface` (not the strong/layered gradient used by the Hero). The Home height must not be visibly inflated.

Inside the card, top row — a slim section title (NOT the `SectionHead`; that stays above the card):

```tsx
<div className="flex items-center justify-between">
  <div>
    <h3 className="text-[1rem] font-extrabold tracking-tight text-ink">SALES FUNNEL</h3>
    <p className="mt-0.5 text-[0.8rem] text-muted">Awareness → Intent → Lead → Daftar → Closing</p>
  </div>
  <span className="rounded-full border border-divider bg-brand/5 px-2.5 py-1 text-[0.75rem] font-semibold text-brand">
    live dari data
  </span>
</div>
```

- The small "live dari data" pill is optional but encouraged as a compact status chip; brand-tinted (`bg-brand/5`, `text-brand`) — a **tiny** blue accent, not a full blue card.
- `border-divider` = `border-border/…`? No — use the `divider` token for hairline chips: Tailwind utility here is `border-divider` (generated from `--color-divider`). If `border-divider` is not a generated utility, use `border-border/60`. Prefer `border-divider`.

---

## 4. SALES FUNNEL row — 5 stage cards + connectors

Below the title row, the funnel is a **row of 5 compact stage cards with arrow connectors between them** and the **linear conversion rate shown small under each connector**.

Layout container (desktop → horizontal, small screen → vertical):

```tsx
<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
```

- On `md+`: one `1fr` column per stage and an `auto` column per connector → exactly 5 stage columns interleaved with 4 connector gaps. This keeps stages equal-width and connectors tightly sized.
- On small screens (`grid-cols-1`): everything stacks vertically (stage, connector, stage, …) — the vertical stack requirement. The connector element renders as a vertical chevron + rate (see below).
- Gap `gap-3` (12px) everywhere; on vertical the stacked rhythm comes from natural order.

### 4.1 Stage card

Each stage is one card. Reusable JSX pattern (map over `stages`; the array order in the page/controller must be `Awareness, Intent, Lead, Daftar, Closing`):

```tsx
<div className="flex flex-col justify-between rounded-[14px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
  {/* top: small blue index tick + stage name */}
  <div className="flex items-center justify-between">
    <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">{stage.name}</span>
    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
  </div>
  {/* value */}
  <div className="mt-3 text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
    {stage.value}
  </div>
  {/* optional sub-label (e.g. Views under Reach) */}
  {stage.sub ? (
    <div className="mt-1 text-[0.8rem] font-semibold text-muted">{stage.sub}</div>
  ) : null}
</div>
```

Stage-specific details (the **exact** primary value + sub-label per stage, per the data contract — all as already-formatted strings from the payload):

| Stage card name | Primary value (big number) | Sub-label (small line) |
|---|---|---|
| `AWARENESS` | Reach main number (e.g. `2.841.036`) | `Views 7.363.486` |
| `INTENT` | Link Click (e.g. `25.550`) | *(none)* |
| `LEAD` | Lead /admin-wa Total Pesan (e.g. `1.436`) | *(none)* |
| `DAFTAR` | Daftar latest-year Total Pendaftar (e.g. `184`) | *(none)* |
| `CLOSING` | Closing (e.g. `70`) | *(none)* |

- **Compact sizing rule (must hold):** stage cards must NOT inflate Home height. The value line is `text-[1.3rem]` (within the spec's `~1.1–1.5rem` primary range; `1.3rem` keeps five cards from spilling) and the card is `p-4`. Do not add hero-like layouts. On `md+` with `md:items-stretch` all five cards are equal height; on small screens they size to their (small) content.
- Color: all five cards are neutral `bg-surface` with a **tiny** brand-blue dot (the `h-1.5 w-1.5 bg-brand` tick) as the only blue, plus blue primary numbers via `text-ink`. **No full blue card** for the funnel stages.

### 4.2 CLOSING endpoint emphasis

The last card (`CLOSING`) gets a gentle emphasis-to-read as the funnel endpoint — a **slight blue ring** + a slightly stronger fill, NOT a fully saturated card:

```tsx
{isClosing && (
  <div className="rounded-[14px] border-2 border-brand/70 bg-brand/[0.06] p-4 shadow-[var(--dm-shadow-xs)] ring-1 ring-inset ring-brand/40">
    {/* same inner structure, but the big number is text-brand for emphasis */}
    <div className="mt-3 text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-brand">{stage.value}</div>
  </div>
)}
```

- Concretely: the CLOSING card uses `border-brand/70`, `bg-brand/[0.06]`, `ring-1 ring-inset ring-brand/40`, and its **primary number renders in `text-brand`** (blue) instead of `text-ink`. The stage-name tick can stay blue. Everything else identical. This reads as "the final, emphasized stage" without a loud full-card block — IKEA restraint.

### 4.3 Connector (arrow + rate)

Between each pair of stages, a small connector column showing a **chevron/arrow** and the **linear conversion rate as a tiny label underneath**.

Desktop (`md+`) connector (a compact stacked column, centered vertically):

```tsx
<div className="hidden items-center gap-1.5 text-brand md:flex" aria-hidden>
  {/* consecutive little chevrons ">>>" */}
  <span className="text-brand">›››</span>
</div>
```

- The chevron is blue (`text-brand`) — blue is the arrow colour on the funnel (yellow is a *tiny* accent, see §4.4). Use three "›" glyphs (`›››`) or a single wide `›`; either is acceptable, keep it thin and small (`text-[0.9rem] leading-none`). Do NOT render a big bold arrow.
- **The rate label** sits right under the connector, centered:

```tsx
<div className="mt-0.5 text-center text-[0.75rem] font-semibold text-muted">{connector.rate}</div>
```

Concretely the connector column (desktop) is:

```tsx
<div className="hidden flex-col items-center justify-center gap-0.5 md:flex" aria-hidden>
  <span className="text-[0.9rem] leading-none text-brand">›››</span>
  <span className="text-[0.75rem] font-semibold text-muted">{connector.rate}</span>
</div>
```

Vertical (small screens) connector — stacked flow, count as a full row between stage cards:

```tsx
<div className="flex items-center gap-1.5 md:hidden" aria-hidden>
  <span className="text-[0.9rem] leading-none text-brand">↓</span>
  <span className="text-[0.75rem] font-semibold text-muted">{connector.rate}</span>
</div>
```

- The 4 connector rates (already-formatted strings; MUST come from the payload — `"0.9%"`, `"5.6%"`, `"12.8%"`, `"38.0%"` at today's values, but always dynamic; `"—"` on zero divisor). **Exactly 4** adjacent-stage connectors in order:
  1. Reach → Click — `0.90%`
  2. Click → Lead — `5.62%`
  3. Lead → Daftar — `12.81%`
  4. Daftar → Closing — `38.04%`

### 4.4 Yellow accent — tiny only

- Yellow (`accent` = `#FFDB00`) appears **only as a tiny accent, never a full card and never an arrow.** Recommended single use: a small corner tick on the SALES FUNNEL row / card header, e.g. a 4px yellow dot or short 16px tick strip in the top-right, or a yellow underline swatch next to the "live dari data" pill.
- Suggested concrete element (top-right corner of the card, absolute) or as the header pill left-edge marker:

```tsx
<span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[var(--dm-shadow-arrow)]" />
```

Place it next to the "live dari data" pill. That is the entire yellow footprint. Do not use yellow for connector arrows.

### 4.5 Overall Lead→Closing footnote

A small overall line at the end of the funnel row (right-aligned or as a footnote under the row), showing the **overall Lead→Closing** rate:

```tsx
<div className="col-span-full mt-2 text-right text-[0.75rem] font-semibold text-muted">
  Konversi keseluruhan Lead → Closing: <span className="text-brand">{overall}</span>
</div>
```

- `overall` is the already-formatted overall rate string (`"4.9%"` at today's values; `"—"` on zero lead). Place it as a `col-span-full` footnote inside the funnel grid so it wraps cleanly under the five columns on desktop and after the last connector on vertical stack. `text-brand` keeps the number as a blue accent.

---

## 5. Supporting-metrics strip

Below the funnel, a small horizontal strip of 4 compact supporting metrics. **Keep it visually lighter than the stage cards** (no `bg-surface` card per item, or softer separator) so it does not compete with the funnel.

Container + items:

```tsx
<div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-divider pt-3 sm:grid-cols-4">
  <SupportItem label="Views" value="7.363.486" />
  <SupportItem label="Interaksi" value="74.954" />
  <SupportItem label="Profile Visit" value="133.314" />
  <SupportItem label="Ad Spend" value="Rp 0" />
</div>
```

```tsx
<div className="flex flex-col">
  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-muted">{label}</span>
  <span className="mt-0.5 text-[1.1rem] font-extrabold tracking-[-0.01em] text-ink">{value}</span>
</div>
```

- 4 items, in this exact order/label: **Views**, **Interaksi**, **Profile Visit**, **Ad Spend**.
- `grid-cols-2 sm:grid-cols-4` → 2-up on small, 4-across on desktop. Hairline top border (`border-t border-divider`) separates the strip from the funnel.
- Supporting values come from the payload: Views / Interaksi (CONTENT INTERACTION) / Profile Visit from `sumMetrics`, and `Ad Spend` from the existing `r.spend` — **keep it an undecorated rupiah string** (`formatRupiah` → `Rp …`; `"—"` when unavailable).
- These are supporting/secondary — smaller than stage cards (`text-[1.1rem]` value, `0.7rem` label), neutral `text-ink`/`text-muted`, no card background. Do NOT add the yellow here.

---

## 6. State handling (from the data contract — keep verbatim)

The data spec §"Linear conversion rates" defines the states; this UI spec maps them to render:

| State | When | Render |
|---|---|---|
| **Loading** | `metricStatus === "loading"` | Skeleton placeholders — **no fake numbers.** Render the full card shell (header strip + 5 stage-card boxes + 4 connector columns + 4 support slots) with each value slot as an `animate-pulse` grey bar. See skeleton markup below. |
| **Error** | `metrics.error && metricStatus === "error"` | **Unchanged from current page**: render `ErrorState failure={metrics.error} onRetry={metrics.refetch}` (do NOT render the funnel card). Copy: "Data unavailable". |
| **Ready (empty)** | API returns `ok:true` but all funnel zeros → `metricStatus === "empty"` | Render the real card with every value rendered via the `formatCount`/`formatPercent`/`formatRupiah` "—" fallbacks (see below). The card shows "—" in place of numbers. |
| **Ready (live)** | normal | Real formatted values. |

Skeleton JSX (loading branch) — reuse the stage-card shell with placeholder bars:

```tsx
<SalesFunnelCard
  loading
  stages={[]}
  connectors={[]}
  supports={[]}
/>
```

And inside `SalesFunnelCard`, when `loading` is true, render 5 skeleton stage boxes + 4 skeleton connector columns + 4 skeleton supports, e.g.:

```tsx
// stage shell, repeated 5×
<div className="flex flex-col justify-between rounded-[14px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]" aria-busy="true">
  <div className="h-3 w-16 rounded bg-muted/20 animate-pulse" />
  <div className="mt-3 h-6 w-20 rounded bg-muted/20 animate-pulse" />
</div>
// connector skeleton
<div className="hidden flex-col items-center gap-1 md:flex" aria-hidden>
  <div className="h-3 w-3 rounded bg-muted/20 animate-pulse" />
  <div className="h-2.5 w-8 rounded bg-muted/20 animate-pulse" />
</div>
// support skeleton
<div className="flex flex-col">
  <div className="h-2.5 w-14 rounded bg-muted/20 animate-pulse" />
  <div className="mt-1 h-4 w-20 rounded bg-muted/20 animate-pulse" />
</div>
```

- Skeleton recipe mirrors `QuickInsightStat`'s `animate-pulse bg-muted/20`: `rounded bg-muted/20 animate-pulse`. No fake numbers anywhere.
- **Zero divisor → "—":** the controller returns `"—"` for any rate whose denominator is `0` (and for any value the formatting helpers flag). The component simply renders the passed string — it never computes. So a zero-divisor stage simply displays `—` in the value slot and `—` under the connector. (This maps to page's existing `empty` handling via `metricStatus === "empty"`; the component receives pre-formatted `"—"` strings.)

**Important:** the current page passes `empty` state by formatting to `"—"` (e.g. `leadsStr`). Keep this pattern — the component is format-agnostic and renders whatever string it receives.

---

## 7. Typography & colour — consistency with Home

Referenced tokens from `ui-common.ts` / `globals.css` (use the token utilities, never magic hex):

| Element | Class pattern | Rationale |
|---|---|---|
| Card value (stage primary) | `text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink` | Same figure style as `QuickInsightStat` (§C.7), slightly smaller to fit 5 columns |
| Supporting value | `text-[1.1rem] font-extrabold tracking-[-0.01em] text-ink` | Secondary tier |
| Stage name / support label | `text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted` (stage) / `text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-muted` (support) | Small labels per spec `~0.8rem` minimum |
| Rate under connector | `text-[0.75rem] font-semibold text-muted` | Small footnote-like |
| Sub-label (Views under Reach) | `text-[0.8rem] font-semibold text-muted` | Supporting sub-number |
| Section title inside card | `text-[1rem] font-extrabold tracking-tight text-ink` | Scaled-down `SectionHead` voice |
| Card shell | `rounded-[20px] border border-border bg-surface shadow-[var(--dm-shadow)]` | Repo glass-card recipe |
| Stage card / skeleton | `rounded-[14px] border border-border bg-surface shadow-[var(--dm-shadow-xs)]` | RADII.md / SHADOWS.xs |
| Closing emphasis | `border-2 border-brand/70 bg-brand/[0.06] ring-1 ring-inset ring-brand/40` + `text-brand` value | Endpoint |
| Connector arrow | `text-brand` | Blue arrow |
| Yellow tick | `bg-accent shadow-[var(--dm-shadow-arrow)]` + `rounded-full h-1.5 w-1.5` | Tiny accent only |

- **Blue `#0058A3` primary** across the card via `text-brand` / `bg-brand/…` on small accents; **`text-ink` / `text-muted`** for the bulk of the copy (matches Home).
- **Yellow `#FFDB00`** is the **accent ONLY** — one small dot/tick (see §4.4). Never a full card.
- **Typography scale fits Home:** primary `1.1–1.5rem` numbers (use `1.3rem`; supporting `1.1rem`), labels `~0.8rem` (stage/support labels `0.7rem` uppercase are within the compact spec's small-label allowance). Family inherits `--font-sans` (Manrope) from the app — do not change fonts. Numbers use `font-extrabold` + `tracking-[-0.02em]` as the figure style elsewhere on Home.

---

## 8. Responsive behaviour

- **Desktop (`md` = 768px up):** the funnel renders horizontally — 5 equal `1fr` stage columns with `auto` connector columns between them (`md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]`). The whole Home still respects its `max-w-[1180px]` main (this card is just wider than the old 4-tile grid; it fits within the main's `max-w-[1180px]`). Use `md:` prefixed utilities (repo's `BREAKPOINTS.md = 768`) rather than `lg:`.
- **Small screens:** `grid-cols-1` stacks stage → connector(↓ + rate) → stage … vertically. Supporting strip goes `grid-cols-2`.
- **No horizontal scroll** at any width: the 5-column grid only activates at `md+`; below that it's a vertical stack, so nothing overflows mobile. The `auto` connector columns stay narrow.
- Keep paddings identical across widths (`p-5` card, `p-4` stages) so vertical / horizontal look coherent.

---

## 9. Concrete component skeleton (reference structure — implementer maps §4/§5 into this)

```tsx
export function SalesFunnelCard({ loading, stages, connectors, supports, overall }: SalesFunnelCardProps) {
  if (loading) return (/* §6 skeleton: header row + 5 stage skeletons + 4 connector skeletons + 4 support skeletons */);

  return (
    <section aria-label="Sales funnel" className="mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]">
      {/* §3 header strip: SALES FUNNEL + subtitle + live-dari-data pill + yellow tick */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[1rem] font-extrabold tracking-tight text-ink">SALES FUNNEL</h3>
          <p className="mt-0.5 text-[0.8rem] text-muted">Awareness → Intent → Lead → Daftar → Closing</p>
        </div>
        <div className="flex items-center">
          <span className="rounded-full border border-divider bg-brand/5 px-2.5 py-1 text-[0.75rem] font-semibold text-brand">live dari data</span>
          <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[var(--dm-shadow-arrow)]" />
        </div>
      </div>

      {/* §4 funnel grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
        {/* For each stage i in [0..4]: stage card (CLOSING emphasised when i===4) */}
        {stages.map((s, i) => (
          <Fragment key={s.name}>
            {i > 0 && (
              <div className="hidden flex-col items-center justify-center gap-0.5 md:flex" aria-hidden>
                <span className="text-[0.9rem] leading-none text-brand">›››</span>
                <span className="text-[0.75rem] font-semibold text-muted">{connectors[i - 1].rate}</span>
              </div>
            )}
            {/* stage card */}
            {i === 4 ? (
              <div className="flex flex-col justify-between rounded-[14px] border-2 border-brand/70 bg-brand/[0.06] p-4 shadow-[var(--dm-shadow-xs)] ring-1 ring-inset ring-brand/40">
                <div className="flex items-center justify-between">
                  <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">{s.name}</span>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
                </div>
                <div className="mt-3 text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-brand">{s.value}</div>
                {s.sub ? <div className="mt-1 text-[0.8rem] font-semibold text-muted">{s.sub}</div> : null}
              </div>
            ) : (
              <div className="flex flex-col justify-between rounded-[14px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
                <div className="flex items-center justify-between">
                  <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">{s.name}</span>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
                </div>
                <div className="mt-3 text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">{s.value}</div>
                {s.sub ? <div className="mt-1 text-[0.8rem] font-semibold text-muted">{s.sub}</div> : null}
              </div>
            )}
          </Fragment>
        ))}

        {/* §4.5 overall footnote */}
        {overall ? (
          <div className="col-span-full mt-2 text-right text-[0.75rem] font-semibold text-muted">
            Konversi keseluruhan Lead → Closing: <span className="text-brand">{overall}</span>
          </div>
        ) : null}

        {/* vertical-only connectors rendered via the hidden md:flex trick above;
            on small screens, render a ↓ connector row before each stage after the first:
            <div className="flex items-center gap-1.5 md:hidden" aria-hidden>
              <span className="text-[0.9rem] leading-none text-brand">↓</span>
              <span className="text-[0.75rem] font-semibold text-muted">{rate}</span>
            </div> */}
      </div>

      {/* §5 supporting strip */}
      <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-divider pt-3 sm:grid-cols-4">
        {supports.map((x) => (
          <div key={x.name} className="flex flex-col">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-muted">{x.name}</span>
            <span className="mt-0.5 text-[1.1rem] font-extrabold tracking-[-0.01em] text-ink">{x.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

> **Implementer note on vertical connectors:** the tidy way to avoid duplicating stage cards is to let each stage after the first emit its preceding connector. On `md+` the connector is the `›››`+rate column (`md:flex`); on small screens it flips to a `↓`+rate row (`md:hidden`). Both variants are shown in the skeleton above; ship whichever map structure you prefer, but the **rendered output must satisfy §4.3** (arrow + small rate under it, reserved `md:grid-cols-[1fr_auto_…]` template must stay intact so the 5 columns stay equal-width).

---
## 10. Acceptance checklist (render review against this spec)

- [ ] **A1. Scope:** Only the Quick Insight block + its `SalesFunnelCard` changed in `app/page.tsx`. Hero, "Command Center", `SectionHead`, "Explore Your Workspace", topbar, drift banner, footer, `Divider`, layout, other routes, and shared components are byte-identical (git diff shows no edits outside the Quick Insight section).
- [ ] **A2. New component:** `SalesFunnelCard.tsx` created; `QuickInsightStat` no longer imported by `app/page.tsx`. No chart library imported anywhere.
- [ ] **A3. Header:** `SectionHead` title "Quick Insight" + subtitle "Ringkasan angka penting, live dari data." unchanged. Card shows a "SALES FUNNEL" title row + "Awareness → Intent → Lead → Daftar → Closing" sub-line + small "live dari data" pill + yellow tick (tiny).
- [ ] **A4. Five stage cards** present in order AWARENESS, INTENT, LEAD, DAFTAR, CLOSING; each shows name + primary value; AWARENESS additionally shows a "Views …" sub-label. Each card is compact (`p-4`, `text-[1.3rem]` value) — Home height not visibly changed from the old grid.
- [ ] **A5. Connectors:** 4 arrow/chevron connectors (`›››` on desktop, arranged `1fr_auto_…` so 5 stages stay equal-width), each with the **correct adjacent rate** shown small underneath (Reach→Click 0.90%, Click→Lead 5.62%, Lead→Daftar 12.81%, Daftar→Closing 38.04%). Rates are the dynamic payload strings, not hardcoded.
- [ ] **A6. Overall line:** "Konversi keseluruhan Lead → Closing: <rate>" footnote present on the funnel row (`col-span-full`), showing 4.87%-today-style overall rate from the payload.
- [ ] **A7. Colors:** blue `#0058A3` primary accents (`text-brand`, `bg-brand/[0.06]`, `ring-brand/40`); yellow `#FFDB00` appears **only** as the tiny tick/dot (no full yellow card, no yellow arrow).
- [ ] **A8. Closing emphasis:** the CLOSING card is visually the endpoint — `border-2 border-brand/70 bg-brand/[0.06] ring-1 ring-inset ring-brand/40` with its value in `text-brand`; distinct from the neutral others.
- [ ] **A9. Supporting strip:** 4 items in order **Views | Interaksi | Profile Visit | Ad Spend**, `grid-cols-2 sm:grid-cols-4`, values `text-[1.1rem]`, no per-item card background, hairline `border-t border-divider` divider.
- [ ] **A10. States:** loading → `animate-pulse bg-muted/20` skeleton boxes (no fake numbers); error → existing `ErrorState` + retry ("Data unavailable"); zero divisor / empty → `"—"` glyphs rendered from pre-formatted strings. No `NaN`/`Infinity` ever rendered.
- [ ] **A11. Responsive:** horizontal 5-column funnel on `md+` (`max-w-[1180px]` main context); vertical stack (`grid-cols-1`, `↓`+rate connectors) below `md`; supporting strip 2-up on small. No horizontal scroll at any width.
- [ ] **A12. Controllers/data:** no business metric is computed in the browser; all scalars (incl. `funnel`/`connectors`/`overall`/`supports`) are server-side strings per the data spec §"Data-access architecture". Hero's existing payload fields (`leads/closing/conversion/spend/cac/roas/omzet`) still rendered intact.
- [ ] **A13. Type-only contract:** `SalesFunnelCardProps` fields (`stages`, `connectors`, `overall`, `supports`, `loading`) match the page wiring; arrays are exactly length 5 / 4 / 4 at runtime.