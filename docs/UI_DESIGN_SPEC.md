# DIGMARK V3.1 — UI/UX DESIGN SPECIFICATION (Phase D)

**Status:** Implementation-ready design source of truth for the V3.1 UI Shell + Design System.
**Author:** NEO (Lead UI/UX Designer) · **Consumer:** REX (implementing engineer).
**Authority:** The V3 validated design language, extracted verbatim from `D:\digmark-v3\ui\components.py` (single shared stylesheet `apply_style()`) and composed in `D:\digmark-v3\pages\1_Overview.py`. Reference architecture: `D:\digmarkv3.1\NEXTJS_ARCHITECTURE.md` (§2 folder, §4 component mapping, §7 auth). API contract confirmed in `src/server/api/*Controllers.ts` + `src/lib/errors.ts` (Phase C, live).
**Stack assumptions:** Next.js 16 App Router · React 19 · Tailwind CSS 4 · TypeScript. Build from THIS document only — emphasise not required to read V3 Python.
**Scope:** Spec doc only. No React/Tailwind implementation code is authored here, no `src/`/`app/` code is modified, no dev server is started.

---

## A. Design Principles & Provenance

### A.1 Principles (carried from V3, now enforced as rules)

1. **One design-token source.** V3 kept a single stylesheet; V3.1 keeps a single Tailwind theme. Tokens live in `styles/globals.css` (`@theme inline` / CSS custom properties) + `src/components/ui-common.ts` (colour, radius, shadow constants). Components NEVER hard-code magic numbers — a raw `color:[#0058A3]` in a component is a spec violation.
2. **Thin UI over a pure domain layer.** Pages consume the real Phase C API only. No component talks to Sheets. No metric math in components — call `GET /api/tables/[key]` and render normalized rows.
3. **Preserve the validated product language.** This is a *translation*, not a redesign. Every token, component, and copy string below maps 1:1 to a V3 original unless a change is flagged `[CHANGED]` with a written justification. If a V3 value survives unchanged it is flagged `[PRESERVED]`.
4. **Glassmorphism as brand.** The IKEA blue/yellow + frosted-glass "command center" look is the brand. It is not decorative CSS — it is the product identity and must not be visually diluted.
5. **Every state is specified.** No component ships with only a "default" look. Loading / empty / error / hover / active / disabled / focused are part of every contract.
6. **Concrete values only.** Ambiguity = bug. All px, weights, colours, radii, breakpoints, elevation and timings are given below.

### A.2 What is preserved vs what changes

| Area | V3 | V3.1 | Rationale |
|---|---|---|---|
| Palette (blue `#0058A3`, blue_hover `#0A6FBF`, yellow `#FFDB00`, ink, muted, grid, success/warn/danger) | `config/settings.py` COLORS | `src/config/constants.ts` COLORS + semantic Tailwind tokens | `[PRESERVED]` — identical hex. |
| Font: Manrope 400/600/700/800 | Google Fonts `@import` in CSS | `next/font/google` Manrope | `[CHANGED]` — move to self-hosted/next/font for offline + perf; glyphs/weights identical. |
| Background: layered radial gradients (blue top-left, yellow top-right) over 165° linear `#eef3fb→#f7f9fd→#fbf6e6` | `apply_style()` | Tailwind `body`-level token | `[PRESERVED]`. |
| Glass cards: `rgba(255,255,255,.72)` surface, `.85` strong, `blur(8–14px) saturate(140–150%)`, white border | `apply_style()` | `glass` token family | `[PRESERVED]` — exact alphas/blur preserved as reusable tokens. |
| Radii 20/14/pill; shadows `0 8px 22px` & hover `0 18px 38px` at `rgba(0,88,163,…)` | `apply_style()` | shadow/radius token family | `[PRESERVED]`. |
| Typography scale (h1 hero `clamp(2.1rem,4.6vw,3.4rem)`, module h1 `clamp(1.7rem,3.4vw,2.5rem)`, section h3 `1.18rem/800`, etc.) | `apply_style()` | Heading + body token scale (`dm-display-*`/`dm-h1`…) | `[PRESERVED]` — rem→clamp preserved via `text-2xl … clamp` utility. |
| Workspace cards, KPI MetricCard, Quick Insight Stat, hero visual panel, footer | `ui/components.py` | One React component per primitive (`WorkspaceCard`, `MetricCard`, `QuickInsightStat`, `HeroVisualPanel`, `Footer`) | `[PRESERVED]` — identical anatomy (see §C). |
| Copy strings (mixed EN/ID) | `1_Overview.py` + components | Same copy | `[PRESERVED]` — e.g. "Explore Your Workspace", "Pilih modul…", "semua data live", "Open Workspace →", "DIGMARK", tagline, "LPK Duta Persada". Do NOT force English-only. |
| **No sidebar; index page = navigation** | `st_sidebar display:none` | **Topbar brand + Home; workspace cards are the nav** | `[CHANGED]` — V3's index-as-nav is validated and kept; see §C.2. |
| Buttons/inputs native polish (radius 12, surface bg, blue focus border) | `apply_style()` | `Button` + `Field` components | `[PRESERVED]`. |
| `prefers-reduced-motion` disables hover lifts | `apply_style()` `@media` | Tailwind `motion-reduce:` variant | `[PRESERVED]`. |

**The single most important improvement V3.1 adds over V3 is NOT visual:** V3 mixed `unsafe_allow_html` CSS classes with native Streamlit widgets; V3.1 gives every visual an explicit React component renderer with stated states, so behaviour is testable and maintainable. The pixels stay the same.

---

## B. GLOBAL DESIGN SYSTEM

### B.1 Typography

- **Family:** Manrope, loaded via `next/font/google` in `app/layout.tsx` (`variable: "--font-manrope"`). Weights 400, 600, 700, 800. Set as `--font-sans` so Tailwind's `font-sans` and all `font-manrope` references resolve.
- **Fallback stack** (in case of font fetch failure): `Manrope, ui-sans-serif, system-ui, sans-serif` (matches V3 fallback).
- **Default `body`:** `font-sans`, `text-[15px]` base (V3 effectively 1rem system; 15px optical body is the closest tailwind-native reading match — keep `text-sm/[15px]` for body copy and `text-base` only for inputs). Use `antialiased` on `<html>` (V3 did).
- **Global letter-spacing:** headings get tracking-tight (`tracking-tight` = `-0.01em`, V3 `-0.01em`) / heavier display heads `-0.02em` via `dm-display-h1`. Body copy normal (`tracking-normal`).
- **Headings + body token scale** (rem units; Tailwind classes given where useful):

| Token | rem → px (@15px base) | Weight | Letter-spacing | Line-height | Use |
|---|---|---|---|---|---|
| `dm-display-h1` (hero) | `clamp(2.1rem, 4.6vw, 3.4rem)` → clamped 33.6px→54.4px | 800 | `-0.02em` | 1.06 | Homepage hero title |
| `dm-h1` (module) | `clamp(1.7rem, 3.4vw, 2.5rem)` → 27.2→40px | 800 | `-0.02em` | 1.1 | Workspace page hero title |
| `dm-h2` (page section head) | `text-[1.9rem]` = 30.4px | 800 | `-0.01em` | 1.2 | "Explore Your Workspace", "Quick Insight" |
| `dm-h3` (section) | `text-[1.18rem]` = 18.9px | 800 | `-0.01em` | 1.4 | `SectionHeader` titles |
| `dm-h4` (card title) | `text-[1.08rem]` = 17.3px | 700 | `-0.01em` | 1.35 | `WorkspaceCard` title |
| `dm-sub` (subtitle) | `text-[1.05rem]` = 15.75px | 400 | normal | 1.55 | Hero sub paragraph (max-width 54ch) |
| `dm-meta` (caption/label) | `text-[0.82rem]` = 12.3px | 600 | normal | 1.4 | `MetricCard` label, `SectionHeader` sub |
| `dm-kicker` (chip) | `text-[0.76rem]` = 11.4px | 700 | `+0.05em` (tracking-widest) | 1 | `HeroKicker` chip |
| `dm-display-value` (KPI value) | `text-[1.6rem]` = 25.6px | 800 | `-0.02em` | 1.05 | `MetricCard` value |
| `dm-display-value-lg` (insight value) | `text-[1.5rem]` = 24px | 800 | `-0.02em` | 1.1 | `QuickInsightStat` value |

- **Colour pairing for text:** headings & values always `ink`; captions/labels/subs always `muted`; interactive text `blue_hover` (V3 `.dm-home`/`.dm-open`); accent words `blue`.

### B.2 Colour tokens (semantic; Tailwind `@theme`)

Source of truth YAML (map into `styles/globals.css` `@theme inline` + also keep as JS constants in `src/components/ui-common.ts` for inline styles/RGBA). **Hex values are `[PRESERVED]` verbatim from `src/config/constants.ts`.**

| Token | Value | V3 origin | Surface use |
|---|---|---|---|
| `brand` | `#0058A3` | blue | CTA, gradients, links, SectionHeader echo, footer mark |
| `brand-hover` | `#0A6FBF` | blue_hover | hover on gradient ends, interactive text |
| `accent` | `#FFDB00` | yellow | kicker arrow, stat divider, rad badge, section bar (left border), dot2 |
| `accent-deep` | `#f4c400` | (V3 radial mid) | DM ball/badge radial 60% mid-stop |
| `ink` | `#102A43` | ink | all text/values/headings |
| `muted` | `#5B6B7E` | muted | labels, captions, sub paragraphs, desc |
| `grid` | `#E6EBF2` | grid | chart grid/track, table row separators |
| `success` | `#22A06B` | success | positive delta, status dots |
| `warning` | `#E8930C` | warn | warning states |
| `danger` | `#D64550` | danger | destructive, negative delta |
| `surface` | `rgba(255,255,255,0.72)` | `--dm-surface` | card fill alpha |
| `surface-strong` | `rgba(255,255,255,0.85)` | `--dm-surface-strong` | hover fill, metric chips |
| `surface-input` | `rgba(255,255,255,0.55)` | (V3 input bg) | input fill alpha |
| `border` | `rgba(255,255,255,0.9)` | `--dm-border` | all card borders |
| `focus-ring` | `brand` (`#0058A3`) `ring-offset-2` | (V3 input:focus border) | `[PRESERVED]` focus = brand blue ring/border; see B.6 |
| `divider` | `rgba(0,88,163,0.12)` | `.dm-divider` | section/table/footer rules |
| `blue-glow` | `rgba(0,88,163,0.10)` | hero radial | background radial blue |
| `yellow-glow` | `rgba(255,219,0,0.14)` | hero radial | background radial yellow |
| `ink-on-brand` | `#FFFFFF` | (V3) | text on brand gradient (CTA/chip/badge) |

**Dark-mode note:** V3 is a **light-first** app with a fixed layered light background (gradients assume light). The current Phase A `globals.css` has a `prefers-color-scheme: dark` block — DROP it for this design system. **Do not introduce a dark theme** (out of scope, no V3 counterpart, and the glass recipe relies on white gradients). Remove the existing dark block and the zinc/Arial shell entirely and replace with §B.5. Document this in a code comment.

### B.3 Spacing scale (4px base)

Tailwind spacing purists: map to the standard `1=4px` so Tailwind utilities (`gap-4`, `px-3`, `mt-6`) alias cleanly. V3 used rem (`.8rem`=12.8, `1rem`=16, `1.2rem`=19.2, `1.4rem`=22.4, `2.6rem`=41.6, `3rem`=48). Provide the semantic aliases:

| Token (Tailwind class) | Value | V3 parity | Typical use |
|---|---|---|---|
| `dm-space-1` (`p-1`/`gap-1`) | 4px | — | dot gaps |
| `dm-space-2` (`p-2`/`gap-2`) | 8px | `.5rem` | icon–label gaps |
| `dm-space-3` (`gap-3`) | 12px | `.75rem` | metric head gap |
| `dm-space-4` (`gap-4`) | 16px | `1rem` | default component padding/gaps |
| `dm-space-6` (`gap-6`) | 24px | `1.5rem` | card grid gaps |
| `dm-space-8` (`gap-8`) | 32px | `2rem` | hero inner rhythm |
| `dm-space-10` (`gap-10`) | 40px | `2.6rem` ≈ `2.5rem` | hero grid column gap |
| `dm-space-3x4` (`my-3`+`my-4`) | 48px | `3rem` | section rhythm |
| Card padding: `px-5 py-4` (20px/16px sides) | ~`.dm-metric` `1rem 1.15rem` | `[PRESERVED]` optically |
| Page max-width | `max-w-[1180px]` | `.dm-wrap` (1180px) | `[PRESERVED]` |
| Block container max | `max-w-[1220px]` wrappers | `.block-container` 1220px | `[PRESERVED]` outer |

### B.4 Border-radius & shadow scale

| Token | Value | Use |
|---|---|---|
| `dm-radius-sm` | 10px | tabs top, icon tile `34px` (10px), tag icons |
| `dm-radius-sm6` | 12px | buttons, inputs, Home pill |
| `dm-radius-md` | 14px | metric chips, `.dm-card` small, expander |
| `dm-radius-md16` | 16px | monogram tile (56px), module ico (54px→52px card), 46px card icon |
| `dm-radius-lg` | 20px | metric cards, workspace cards, list |
| `dm-radius-panel` | 22px | hero visual panel |
| `dm-radius-pill` | `9999px` | kicker chip, WORKSPACE badge, yellow ball (circle) |

| Shadow token | Value | Use |
|---|---|---|
| `dm-shadow-xs` | `0 3px 10px rgba(0,88,163,0.08)` | Home button rest, small chips |
| `dm-shadow-xs-b6` | `0 4px 12px rgba(0,88,163,0.10)` | metric chips, icon tiles |
| `dm-shadow` | `0 8px 22px rgba(0,88,163,0.10)` | card rest (metric/workspace/stat) |
| `dm-shadow-hover` | `0 18px 38px rgba(0,88,163,0.20)` | card hover |
| `dm-shadow-lift` | `0 20px 45px rgba(0,88,163,0.18)` | workspace-card hover (V3 uses this value) |
| `dm-shadow-cta` | `0 6px 18px rgba(0,88,163,0.25)` | CTA rest |
| `dm-shadow-cta-hover` | `0 10px 24px rgba(0,88,163,0.32)` | CTA hover |
| `dm-shadow-panel` | `0 18px 40px rgba(0,88,163,0.16)` | hero visual panel |
| `dm-shadow-home-hover` | `0 8px 18px rgba(0,88,163,0.22)` | Home hover (uses blue-hover cloud) |
| `dm-shadow-mono` | `0 8px 20px rgba(0,88,163,0.30)` | monogram tile |
| `dm-shadow-arrow` | drop-shadow `0 2px 6px rgba(255,219,0,0.35)` | yellow arrow |
| `dm-shadow-ball` | `0 10px 24px rgba(240,200,0,0.40)` | yellow module-count ball |

### B.5 Background (app-level layer)

Applied to `<body>` (or a full-height background layer div) — **paint once at root**, `fixed`. V3 used a fixed attachment; use `bg-fixed` / `background-attachment:fixed` on a full-page element.

```
radial-gradient(1200px 600px at 12% -8%, rgba(0,88,163,0.10), transparent 60%),
radial-gradient(1000px 520px at 108% 0%, rgba(255,219,0,0.14), transparent 55%),
linear-gradient(165deg, #eef3fb 0%, #f7f9fd 48%, #fbf6e6 100%)
```

Exact V3 values — `[PRESERVED]` verbatim. Provide as `dm-bg-glow` token + also implement as a `Background` decorative div so opaque-content pages (tables with sticky headers inside `backdrop-blur`) still read the glow.

### B.6 Interaction states (global)

- **Hover (mouse):** any glass surface lifts by the stated Y (2px metric / 5px `.dm-card` / 6px workspace) AND elevates to its `-hover` shadow AND fills to `surface-strong`. Gradient CTAs/chips deepen shadow + slight lift (`-1px`). Respect `prefers-reduced-motion: reduce` → **all translate-y become `none`** (Tailwind `motion-reduce:`).
- **Active / pressed:** invert lift to `translate-y-0` + shadow `dm-shadow-xs` (buttons). Tabs: active gets `ink` text weight 700 + blue underline/active tint (V3 active tab = blue text weight 700); inactive muted.
- **Focus (keyboard):** every focusable gets `focus-visible:ring-2 ring-inset ring-brand ring-offset-2` (or border `brand` + shadow). Never remove the ring. Inputs: focus border `brand` (V3 parity) + `dm-shadow-xs`.
- **Disabled:** `opacity-50`, `cursor-not-allowed`, no hover lift, no shadow shift, `aria-disabled="true"`.
- **Timings:** transforms `150–200ms ease`; shadows `180–220ms ease`; colour/background `180–200ms ease`. Standardise on `transition-all duration-200 ease-out` for cards, `duration-150` for buttons/links, `duration-300` for layout/panel reveal. Reduced motion → 0ms.
- **Loading:** skeleton shimmer (grey-ray of the card silhouette using `muted` at 20% fill + pulse) — never raw blank. Animated with `animate-pulse` (respected by reduced-motion? pump only while loading, it's transient — acceptable).

### B.7 Glassmorphism recipe (the brand core — read this before writing any card)

Every "glass" surface = **1) translucent white fill + 2) `backdrop-filter` blur/saturate + 3) white hairline border + 4) blue-tinted drop shadow.** The exact numbers make it "glass" vs "plain white card" — do not simplify.

```
base:   bg-surface(s) + backdrop-blur(N) saturate(S) + border border + shadow dm-shadow
strong: bg-surface-strong + backdrop-blur(N) saturate(S) + border border + shadow dm-shadow
```

Per-card values (all `[PRESERVED]` from V3):

| Component | Fill | Blur | Saturate | Radius | Shadow |
|---|---|---|---|---|---|
| MetricCard | surface | `10px` | `140%` | 20px | `dm-shadow` |
| WorkspaceCard | surface (strong on hover) | `12px` | `150%` | 20px | `dm-shadow` → `dm-shadow-lift` |
| QuickInsightStat | surface | `10px` | `140%` | 18px | `dm-shadow` |
| HeroVisualPanel | surface | `14px` | `150%` | 22px | `dm-shadow-panel` |
| ChartContainer | surface | `8px` | `140%` | 18px | `0 6px 18px rgba(0,88,163,0.08)` |
| Home pill / buttons | surface | `6px` | — | 12px | `dm-shadow-xs` |
| Metric chips (`dm-chip-val`) | `surface-strong` (`.85`) | — | — | 14px | `dm-shadow-xs-b6` |
| Expander | surface | `6px` | — | 14px | — |
| Table wrapper | surface | `8px` | — | 16px | `dm-shadow` (soft) |

Backdrop-filter caveat: on `position: sticky` headers or heavy tables the `blur` can bleed — put the table in a surface wrapper (blur 8px) and let the inner table be flat `bg-white/85` so sticky rows don't accumulate multiple glass layers. This is an implementation detail REX must honor.

### B.8 Z-index layering

| Layer | z-index | Elements |
|---|---|---|
| Background glow | `-z-10` | glow gradients |
| Table row zebra / card fill | `0` (default) | cards, table rows |
| Glass surfaces | `z-10` | glass cards, panels |
| Topbar (sticky) | `z-40` (sticky with `backdrop-blur-md bg-white/70`) | brand + Home |
| Modal / Overlay | `z-50` | confirm modals, sheet dropdowns, context menus |
| Toast / notifications | `z-60` | transient inline toasts |

### B.9 Responsive breakpoints (Tailwind-first)

Author against these **exact** names/values (Tailwind defaults). Below each, define what collapses. V3 had no breakpoints (Streamlit native responsiveness) — V3.1 sets the contract:

| Breakpoint | Tailwind prefix | px (min-width) | Design intent |
|---|---|---|---|
| base | *(no prefix)* | 0 | stack everything, single column, hamburger-optional (see nav) |
| `sm` | `sm:` | 640 | sprawl starts (pills, inline hero stats) |
| `md` | `md:` | 768 | hero 2-col, workspace 2-col, insight 2-col |
| `lg` | `lg:` | 1024 | hero 2-col full, workspace 3-col, insight auto-fit 4 |
| `xl` | `xl:` | 1280 | max-width applies (`max-w-[1180px]`), full typography clamps |
| `2xl` | `2xl:` | 1440 | nothing further — luxury whitespace, `max-w-[1220px]` outer |

- **Stack rules (concrete):**
  - Hero grid `1.15fr 1fr`: **2-col `md:` up**; **stack `below md`** (text then visual panel below, centered).
  - Workspace `auto-fill minmax(250px,1fr)`: 3-col at `lg`, 2-col at `md`, 1-col below. (V3 `.dm-grid` = `repeat(auto-fill,minmax(250px,1fr))` — preserved; the 3-column batch loop in Overview’s `st.columns(3)` is what hard-coded 3-per-row; V3.1 lets the grid flow, which is the validated *look* minus the rigid batch.)
  - Quick Insight `auto-fit minmax(190px,1fr)`: 4-up `lg`, 2-up `md`, 1-up below.
  - Topbar: brand left + Home right always visible; on `base` shrink brand wordmark padding but keep both.
  - No hamburger menu required at any breakpoint (nav is the workspace-card grid + Home button — validated V3 pattern, works at 1-col).

---

## C. CORE COMPONENTS

One file per component in `src/components/**`. Each component lists **purpose, anatomy (ordered DOM), hierarchy, states, responsive, interaction**. REX maps DOM exactly.

### C.1 `Topbar` (`src/components/layout/Topbar.tsx`)
- **Purpose:** persistent brand + Home affordance. No sidebar (V3 `display:none`).
- **Anatomy (ordered):** `<header class="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-divider">` → inner `max-w-[1220px] mx-auto px-4` flex `justify-between items-center` →
  1. `Brand` (`.dm-logo`): `a href="/"` flex `items-center gap-2` → `span Dot-big` (15×15px `rounded-full` `bg-[linear-gradient(135deg,brand,brand-hover)]`) → `span Dot-small` (9×9 `rounded-full bg-accent`) → `span` wordmark **DIGMARK** `font-manrope font-extrabold text-lg tracking-widest text-ink`.
  2. `HomeButton` (right): `a href="/"` `dm-home` pill → icon `🏠` (inline) + label **Home** + `title="Kembali ke homepage"`.
- **Hierarchy:** wordmark weight 800 `text-[1.12rem]` (17.9px) `tracking-[0.05em]`; Home pill label `text-[0.86rem] font-bold text-brand-hover`.
- **States:** Home rest = `bg-surface border border-border rounded-xl px-4 py-2 font-bold text-[0.86rem] text-brand-hover shadow-dm-xs`; **hover** = `translate-y-[-1px] bg-[linear-gradient(135deg,brand,brand-hover)] text-white shadow-dm-home-hover`; reduced-motion → no translate. **Active page** is Home on `/` → show pill as `is-active` (darkened) but hover still lifts (V3 keeps it clickable).
- **Responsive:** brand padding `px-4`→ `px-2` `base`; never hidden.

### C.2 `Navigation` (workspace nav — decision)
**Decision `[CHANGED with rationale]`: keep V3's index-page-as-nav.** V3 has NO persistent nav rail; the homepage’s `WorkspaceCard` grid `#workspace` *is* the navigation, plus a sticky Home touchpoint in the Topbar. Rationale: (1) it is the validated product behaviour — users land on the command center and choose a module; (2) it keeps the glass command-center identity uncluttered; (3) it avoids inventing a nav pattern for a 7-item internal tool. Therefore:
- **Element:** the "Explore Your Workspace" section (C.8 `WorkspaceSection`) renders the 7 `MODULES` from `src/config/constants.ts` as `WorkspaceCard` links to `/{url}`.
- No separate nav rail, no sidebar, no mega-menu.
- **`[CHANGED]` addition (justified):** each workspace page shell also renders `Topbar` (Home) + a `Breadcrumb`/context strip `WorkspaceNav` — a compact horizontal `space-x` row of the 4–7 sibling modules as pills, rendered only on workspace pages (not on `/`). Justification: V3 users had the native Streamlit multipage top nav as an escape hatch; V3.1 loses that, so a minimal sibling pill row prevents dead-end sessions without introducing a sidebar. It uses the `section-tabs` styling (see C.4 active-tab look).

### C.3 `Hero` — command-center variant (`src/components/layout/Hero.tsx`) — **the Overview hero**
- **Purpose:** what the app is; sets the command-center tone.
- **Anatomy (grid `1.15fr 1fr` gap >= `lg`, stack < `md`):**
  **Left `HeroText`:**
  1. `HeroKicker` `chip`: `span` pill `bg-[linear-gradient(135deg,brand,brand-hover)] text-white rounded-full px-3 py-1 font-bold text-[0.76rem] tracking-[0.05em]` → label **DIGMARK**.
  2. `h1` `dm-display-h1` → text `Digital Marketing ` + `span.dm-acc text-brand` **Command Center**.
  3. `p.sub` `text-muted max-w-[54ch] leading-[1.55] text-[1.05rem]`: "Kelola, pantau, dan analisis seluruh aktivitas digital marketing Duta Persada dalam satu dashboard."
  4. `HeroActions` flex `gap-6 flex-wrap` margin-top `6`:
     - `CTA` (`a#workspace`): "Explore Workspace →" `dm-cta` (see C.14 primary).
     - `HeroStats` (V3 inline stat after CTA): `flex items-center gap-3 text-muted text-[0.9rem] font-semibold` → `span text-ink` `{closing} siswa closing` → `span.text-accent font-bold` `•` → `span text-ink` `{roas} ROAS`.
  **Right `HeroVisual` (`HeroVisualPanel`) — glass command-center card:**
  1. `<div class="relative p-4">` wrapper.
  2. `VisualPanel` `bg-surface backdrop-blur(14px) saturate(150%) border border-border rounded-[22px] shadow-panel p-5 px-6`:
     - `PanelHeader` flex `gap-4`: `Monogram` `.dm-mono` 56×56 `rounded-2xl bg-[linear-gradient(135deg,brand,brand-hover)] text-white font-extrabold text-[1.35rem] shadow-mono` → **DM**; `PanelInfo` (flex-1): `PanelTitle` font-bold text-ink **Command Center** + `PanelOrg` text-muted text-[0.82rem] **LPK Duta Persada**.
     - `PanelMetrics` grid `1fr auto 1fr gap-4 mt-5 items-center`: `MetricChip`(`{closing}`/**siswa closing**) → `MetricArrow` (`→` `text-accent text-[1.6rem]` drop-shadow-arrow) → `MetricChip`(`{roas}`/**ROAS**). MetricChip = `bg-white/85 border border-border rounded-[14px] shadow-dm-xs-b6 px-3 py-2` → `strong text-ink font-manrope` value + `span text-muted text-[0.78rem]` label.
     - `PanelFooter` flex `gap-4 mt-5 items-center`: `PanelStatus` flex-1 text-muted text-[0.82rem] `{N} modules • semua data live ke Google Sheets`; `PanelBadge` `.dm-ball` 70×70 `rounded-full` radial `circle at 30% 30%` `accent→accent-deep 60%→accent`, `text-ink font-extrabold text-[1.9rem] shadow-ball` → `{N}` (module count).
- **Hierarchy:** chip → h1 (dominant) → sub → CTA+stats; panel balances right column; ball/vivid counts are the accent anchors.
- **States:** CTA hover per C.14; panel is non-interactive (static). Reduced-motion disables CTA lift.
- **Responsive:** stack below `md` (panel below text, max-width to keep 70px ball visible); hero `gap-10`.

### C.4 `Hero` — module variant (`ModuleHero.tsx`)
- **Purpose:** workspace page intro.
- **Anatomy:** `dm-module-hero` wrapper `pb-5`: `KickerChip` (**MODULE**, same style as C.3 chip) → `Icon` 54×54 `rounded-2xl bg-[linear-gradient(135deg,rgba(0,88,163,0.10),rgba(255,219,0,0.22))] text-[1.6rem]` → `h1.text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.1]` → `p.sub text-muted text-[1rem] max-w-[62ch]`.
- **Responsive:** single column; icon above title; paddings `px-4`→`px-6`.

### C.5 `MetricCard` (`src/components/metrics/MetricCard.tsx`)
- **Purpose:** one glass KPI tile.
- **Anatomy:** `<article class="dm-metric flex flex-col gap-1 bg-surface backdrop-blur-[10px] saturate-[140%] border border-border rounded-[20px] shadow p-4">`
  1. `MetricHead` flex `items-center gap-2`: `MetricIcon` 34×34 `rounded-[10px] bg-[linear-gradient(135deg,rgba(0,88,163,0.10),rgba(0,88,163,0.16))] text-[1rem]` (icon or `•`); `MetricLabel` `text-muted font-semibold text-[0.82rem]`.
  2. `MetricValue` `text-font-manrope text-[1.6rem] font-extrabold text-ink tracking-[-0.02em] leading-[1.05] mt-px`.
  3. *(optional)* `MetricDelta` `text-[0.82rem] font-semibold` → `text-success` for positive, `text-danger` for negative, otherwise `text-muted`.
- **States:** rest; **hover** `translate-y-[-2px] shadow-hover`; loading → skeleton `h-6 rounded` width 40%; empty → value renders `—` (muted); error → value `—` + native title tooltip.
- **Responsive:** grid parent handles flow; card itself fixed size.

### C.6 `MetricRow` (`src/components/metrics/MetricRow.tsx`)
- **Purpose:** render N `MetricCard`s in a responsive auto-fit row (V3 `st.columns(n)`).
- **Anatomy:** wrapper `grid gap-6` `repeat(auto-fit,minmax(220px,1fr))`; children `MetricCard`s.
- **Responsive:** auto-fit; 4-up `lg`, 2-up `md`, 1-up below.

### C.7 `QuickInsightStat` (`src/components/metrics/QuickInsightStat.tsx`)
- **Purpose:** homepage Quick Insight tile (V3 `.dm-stat`).
- **Anatomy:** `<div class="dm-stat bg-surface backdrop-blur-[10px] saturate-[140%] border border-border rounded-[18px] shadow p-4">` → `Key text-muted text-[0.8rem] font-semibold` → `Value text-font-manrope text-[1.5rem] font-extrabold text-ink mt-1`.
- **States:** rest only (single-purpose); loading skeleton `h-4`/`h-8`; empty `—`.

### C.8 `WorkspaceSection` + `WorkspaceCard` (`src/components/layout/` & `grid`)
- **Purpose:** homepage "Explore Your Workspace" — this IS the navigation (C.2).
- **`WorkspaceSection` (container):**
  1. `h2 dm-h2` `id="workspace"` → **Explore Your Workspace**.
  2. `p sub text-muted text-[1rem]` → "Pilih modul untuk membuka workspace digital marketing Anda."
  3. `Grid` `grid gap-6 repeat(auto-fill,minmax(250px,1fr))` → 7 `WorkspaceCard`s (ORDER = `MODULES` array order from `src/config/constants.ts`). Rendered from the module registry — never hardcoded.
- **`WorkspaceCard`:**
  - **Anatomy:** `<article class="dm-workspace-card relative overflow-hidden bg-surface backdrop-blur-[12px] saturate-[150%] border border-border rounded-[20px] shadow p-5 pb-4 transition-all duration-200">`
    1. `TopGradient` `::before` absolute `top-0 left-0 right-0 h-3px bg-[linear-gradient(90deg,brand,accent)] opacity-0` (revealed on hover).
    2. `CardHeader` flex `items-center justify-between mt-4`: `WorkspaceIcon` 52×52 `rounded-2xl bg-[linear-gradient(135deg,rgba(0,88,163,0.12),rgba(255,219,0,0.28))] text-[1.5rem] shadow-dm-xs-b6` (icon from registry); `CardBadge` pill `bg-[linear-gradient(135deg,brand,brand-hover)] text-white px-2.5 text-[0.68rem] font-bold tracking-[0.04em] rounded-full shadow-dm-xs` → **WORKSPACE**.
    3. `h3 dm-h4` **title** (from registry).
    4. `p.dm-card-desc text-muted text-[0.86rem] leading-[1.45]` (from registry desc).
    5. *(stateless link row)* `a "Open Workspace →"` `text-brand-hover font-bold text-[0.78rem] mt-3` — the whole card is the link; this affordance label points to it. (V3 rendered a separate `st.page_link` under the card; V3.1 wraps the whole card in the anchor but keeps this textual affordance for parity.)
  - **Entire `<a>` wraps icon..desc** so it is one click target (`href="/{url}"`, `aria-label={title}`).
  - **States:** rest; **hover** `:-translate-y-1.5` (6px) + `shadow-lift` + `bg-surface-strong` + top gradient `opacity-100`; **focus-visible** ring brand; **active/none**; disabled n/a on homepage (all modules live).
- **Responsive:** grid flow correct (C.9 stack rules). Card internal padding `p-5`→`p-4` `base`.

### C.9 `SectionHeader` (`src/components/sections/SectionHeader.tsx`)
- **Purpose:** consistent headed section with yellow accent bar (V3 `.dm-section`).
- **Anatomy:** `<section class="dm-section my-6">` → `h3` `dm-h3` `pl-3 border-l-[4px] border-accent` **title** → *(optional)* `p text-muted text-[0.86rem] mt-0.5 ml-3` **subtitle**.
- **States:** stateless. Allow `id` anchor.

### C.10 `DataTable` (`src/components/grid/DataTable.tsx`)
- **Purpose:** normalized-rows table (V3 `st.dataframe` + `st.data_editor` target). Consume `GET /api/tables/[key]` → `rows`.
- **Anatomy:** wrapper `div.bg-surface backdrop-blur-[8px] rounded-[16px] shadow overflow-x-auto` → `<table class="w-full border-collapse text-left">` →
  1. `thead` **sticky** (`sticky top-0 z-10 bg-white/90 backdrop-blur-[8px]`), `th text-muted font-semibold text-[0.8rem] uppercase tracking-[0.02em] py-2 px-3 border-b border-divider`.
  2. `tbody` `tr` zebra: `odd:bg-white/70 even:bg-white/85` (or `hover:bg-white/90`), `td text-ink text-sm py-2 px-3 border-b border-divider`. Empty cell `text-muted text-[0.8rem]` `—`.
- **Header/column model:** columns derive from the *union of keys in the first row* of the normalized DTO (or from `src/config/sheets.ts` schema when a DTO is typed). If the API returns typed DTOs per `src/server/adapter/schema.ts`, use that as the definitive column list. Render in schema order; any key present in data but missing in schema → append at the end.
- **Overflow:** enforce `overflow-x-auto` on wrapper (no page hscroll) + `min-w` guard (see §E).
- **Height/scroll:** `max-h-[480px] overflow-y-auto` default; `sticky` header inside.
- **States:**
  - **Loading:** skeleton rows `th/td` shimmer ×5.
  - **Empty:** render `EmptyState` (C.11) inside a single row (`colSpan`).
  - **Error:** `ErrorState` (C.12) replacing table, same wrapper sizing.
- **Responsive:** horizontal scroll below `lg` (195px min per numeric col collapses poorly → keep h-scroll, never squash). Row padding `px-6`? No — `px-8` (32px) side padding on wrapper for glass breathing.

### C.11 `EmptyState` (`src/components/sections/EmptyState.tsx`)
- **Purpose:** friendly no-data.
- **Anatomy:** `<div class="dm-empty flex flex-col items-center justify-center py-16 text-center">` → `Icon` `text-[2.5rem]` (`📭`) → `p text-ink font-semibold text-[1rem]` **message** (`title` arg) → *(optional)* `p text-muted text-[0.86rem]` hint. Wrapper `bg-white/60 rounded-[16px] border border-dashed border-divider` so it reads as a filled zone.
- **Props:** `title`, `hint?`, `icon="📭"`. A11y: `role="status"`.

### C.12 `ErrorState` (`src/components/sections/ErrorState.tsx`)
- **Purpose:** API failure surfaced visibly.
- **Anatomy:** `div` `role="alert"` `bg-white/60 border border-danger/30 rounded-[16px] p-5` → `Icon` `⚠` `text-danger` → `Heading` `text-danger font-bold text-[1rem]` → `Message` `text-muted text-[0.86rem]` → `Retry` (secondary button, C.14) label "Retry".
- **Mapping from API error contract** `{error:{code,message,status}}`: default text "Unable to load this data."; show `message` when not `AUTH_FAILED`/`FORBIDDEN`/`INTERNAL` (security: do not echo server details for those — show generic + code only). **401/403** → show `Session expired — please sign in.` + route to `/login` (or refresh). 404 → "This module has no data yet." 502 → "Google Sheets is temporarily unavailable."
- **Retry** re-calls the fetch (revalidates cache-busting header).

### C.13 `LoadingState` (`src/components/sections/LoadingState.tsx`)
- **Purpose:** skeleton loader matching the shape of what it precedes.
- **Props:** `variant` `"card"|"row"|"table"|"stat"|"inline"` → emits the matching shimmer skeleton (muted/20% fill, `animate-pulse`). Always pair with `aria-busy="true"`. Never render raw blank.

### C.14 `Button` (`src/components/ui/Button.tsx`)
| Variant | Rest | Hover | Notes |
|---|---|---|---|
| **primary** (V3 `.dm-cta`) | `bg-[linear-gradient(135deg,brand,brand-hover)] text-white rounded-[14px] px-6 py-3 font-bold text-[0.92rem] shadow-cta` | `:-translate-y-[1px] shadow-cta-hover` | "Explore Workspace" |
| **secondary** (V3 native button) | `bg-surface border border-border rounded-[12px] px-4 py-2 font-semibold text-ink shadow-xs` | lift `-1px` exact (V3 home), `shadow-xs` | "Retry", "Refresh" |
| **ghost** | `bg-transparent border border-brand/30 text-brand-hover rounded-[12px]` | `bg-brand/5 border-brand text-brand` | quiet links/actions |
| **destructive** | `bg-danger text-white rounded-[12px]` | `shadow danger ring` | clear/delete (requires confirm) |
- **Interaction:** `type` attr respected; `disabled` state = `opacity-50 cursor-not-allowed no-hover`; focus ring brand. Reduced-motion → no translate. `transition: 150ms`.

### C.15 `Button`/Home pill → see C.1 (same family).
### C.16 Form controls (field pattern `Field.tsx` + `TextInput`, `Select`, `Checkbox`)
- **Shared surface:** `bg-[rgba(255,255,255,0.55)] rounded-[12px] border border-border text-ink placeholder-muted/70`. Label (if any) `dm-meta`.
- **Text input:** `h-10 px-3 border focus-visible:border-brand focus-visible:shadow-xs`; focus border `brand` (V3 parity).
- **Select:** same surface; custom chevron `▾` `text-accent`; open state shows `border-brand ring-1 ring-brand/20`.
- **Checkbox:** custom 18×18 `rounded-[5px] border-2 border-brand/40 checked:bg-brand` native `input[type=checkbox]` accent-color brand; label `dm-meta`; disabled `opacity-50`.
- **Focus ring:** `focus:ring-2 focus:ring-brand focus:ring-offset-2` across all.

### C.17 `ChartContainer` (`src/components/charts/ChartContainer.tsx`) — empty frame REX wires later
- **Purpose:** stable visual frame for charts (plays happiest with Recharts, per NEXTJS §4; wire-up deferred to Phase E).
- **Anatomy:** wrapper `bg-surface backdrop-blur-[8px] saturate-[140%] border border-border rounded-[18px] shadow-[0 6px 18px rgba(0,88,163,0.08)] p-2` → optional `ChartHeaderLabel dm-meta` → empty body until wired.
- **Empty-state:** if `data` arg absent/zero-length render `EmptyState title="Belum ada data untuk chart ini."`.
- Must accept `height` (default `h-72`) and stretch width. If a library imports later it swaps the body only — frame/dimensions stable.

### C.18 `Footer` (`src/components/layout/Footer.tsx`)
- **Anatomy:** `<footer class="mt-12 text-center py-6 border-t border-divider">` → `Div mark` **DIGMARK** `font-manrope font-extrabold text-[1.08rem] text-brand tracking-[0.05em]` → `Div.line` `text-muted text-[0.9rem]` 'Digital Marketing Command Center' → `Div.line` 'LPK Duta Persada'.

### C.19 `Divider` (`src/components/ui/Divider.tsx`)
- `hr` `border-t-2 border-[rgba(0,88,163,0.12)] my-8 m-0` — 1px via `border-t` default; keep `my-8` (1.7rem≈27px V3). Stateless.

### C.20 Shared `SectionHead` (homepage big section head)
- "Explore Your Workspace" / "Quick Insight" → `h2 text-[1.9rem] font-extrabold tracking-tight text-ink` + `p dm-section-sub text-muted text-[1rem]`. (Already covered in C.8/C.7 containers.)

---

## D. OVERVIEW PAGE LAYOUT (`app/page.tsx`)

### D.1 Rendering order and grid composition (top→bottom)

```
<body background>                       ← dm-bg-glow (fixed, layered gradients)
  └─ <div class="max-w-[1220px] mx-auto px-4">     ← outer block
      ├─ Topbar (sticky)                           ← C.1  (brand + Home)
      ├─ <main class="max-w-[1180px] mx-auto">
      │    ├─ Hero (command-center)                ← C.3  [2-col lg+, stack < md]
      │    ├─ <Divider/>                           ← C.19
      │    ├─ SectionHead "Explore Your Workspace" ← C.8  container
      │    │    └─ WorkspaceCard grid (7)          ← C.8  (auto-fill ≥250px)
      │    ├─ <Divider/>
      │    ├─ SectionHead "Quick Insight"          ← C.7  container
      │    │    └─ QuickInsightStat grid (4)       ← auto-fit ≥190px
      │    └─ <Footer/>                            ← C.18
      └─ (refresh + login chrome per D.4)
```

Order is fixed and matches V3 `1_Overview.py` exactly: topbar → hero(visual panel) → divider → Explore → divider → Insight → footer. The V3 trailing `refresh_button`/`divider` become a small ghost "🔄 Refresh Data" button (secondary) under the Insight band, right-aligned, wired to the cache-busting refetch (not to a Sheets clear).

### D.2 Data-access contract (the Overview must consume REAL Phase C API)

The browser **never** touches Sheets. Every data need flows through the API. Two read endpoints (confirmed live):

| Need | Endpoint | Response (on OK, 200) | Consumed by |
|---|---|---|---|
| Metric KPIs: closing, ROAS, leads, conversion, ad spend | `GET /api/tables/{key}` for the **source tabs** the pure metric layer needs (V3 computed from `wa_admin`, `sosmed`, `website`, `ads_tiktok`, `ads_meta`, `mekari`) → normalized rows → **server-side metric functions** ported to `src/server/metrics` | `{ ok: true, table: key, rows: [...] }` | Hero chips/stats + Quick Insight. **Rule:** run the funnel/ROI math server-side (a `metrics` use-case route or compute within the API), never re-implement the funnel in the browser. Where phase E has not yet exposed an aggregate endpoint, REX may compute from the tab `GET` rows in a server helper — but presentation must receive final scalar values. For Phase D preview, Overview may render the 4 insight stats from a single `wa_admin`/funnel fetch + `mekari`+`ads` ROI, mirroring V3 import order. |
| Module catalog (7 cards) | Static `MODULES` from `src/config/constants.ts` — NOT an API call | — | Workspace cards (icon/title/desc/url) + hero panel module count `N` |
| Tab availability / health | `GET /api/meta/tabs` → `{ ok, tabs:[{appKey,title,gid,drift}], drift }` | `drift===true` → show a subtle thin `warning` banner under the Topbar: "Několiko tab telah mengubah struktur — data mungkin stale." (copy freeform; keep EN/ID mix) | Health indicator |
| Auth/session | `GET /api/auth/me` → `{ ok, identity, role }` (401 if none) | Drive loading gate + role badges (renders "editor" affordances only when role allows) | Global gate |

**Fetch pattern (all GETs):** a single `useApiTable(key)` hook (or TanStack-oriented client) that: 1) returns `{data, status:'loading'|'ready'|'empty'|'error', error}`; 2) sets `Cache-Control: no-cache`/revalidation header per server cache (TTL 300s canceled on server writes); 3) **empty** = `rows.length===0`(or null table) → `EmptyState`; 4) **error** = non-2xx with the `{error:{code,message,status}}` shape → `ErrorState` with retry. Never render partial.

**Per-section handling (loading / empty / error):**

| Section | Loading | Empty | Error |
|---|---|---|---|
| Hero chips/stats | `—` placeholders + skeleton chips | `—` values; copy stays | Hero still renders (brand first); chips show `—`; status line "data live" degrades to "data sedang sync" |
| Workspace grid | skeleton cards (7 × shimmer) OR render instantly from static `MODULES` (no fetch → no loading) — **render instantly**; only the *count* badge/health waits on meta | n/a (static) | n/a (static) |
| Quick Insight | 4 skeletons | `—` per stat; keep headings | `ErrorState` + Retry |
| Meta/tabs banner | hidden until resolved | hidden (no drift) | hidden (silent; non-critical) |
| Auth gate | full-page spinner on glass panel | n/a | redirect to `/login` on 401/403 |

**Mock/fixture data (visual dev only):** allow `data/*.json` fixtures simulating `rows` for styling passes, gated behind `NEXT_PUBLIC_MOCK_DATA=1` (never on in prod). Metrics math still runs through the same server helper. Never let mock leak into real render paths by default.

### D.3 Overview responsive summary (verify per §E)

- `2xl/xl` 1280–1440: full hero 2-col, workspace 3-per-row, insight 4-up, `max-w` applied.
- `lg` 1024: as above (3-col guaranteed by minmax 250px: 1180/3≈393 ≥250 ✓).
- `md` 768: hero stacks; workspace 2-col; insight 2-col.
- `sm/base` 390–640: single column; hero sub `text-[1rem]`; card paddings `p-4`; ball still 70px (keep absolute visual identity); Home pill compresses.
Check every breakpoint for no horizontal scroll (only DataTable tables may h-scroll inside their wrapper).

---

## E. VISUAL QA CHECKLIST

Run at **1440 / 1280 / 1024 / 768 / 390** (plus 640). For each viewport confirm:

### E.1 Global / background
- [ ] Layered gradient glows present top-left (blue) & top-right (yellow); no hard edges, no scroll-colour banding.
- [ ] `max-w-[1180px]` content block centered; outer `1220px` wrapper; `body` never reveals raw white at edges on `2xl`.
- [ ] No horizontal scrollbar on any non-table viewport (test specifically 390 base).

### E.2 Topbar
- [ ] Sticky on scroll; shows translucent blur over content (`backdrop-blur-md bg-white/70`).
- [ ] Logo primitive exact: 15px & 9px dots, gradient 135deg, wordmark `800/tracking-widest`.
- [ ] Home pill: rest text `brand-hover`, hover → white-on-gradient + lift; focus ring visible; reduced-motion hover has no translate.

### E.3 Hero (command center)
- [ ] Chip "DIGMARK" pill, `0.76rem/700/tracking-[0.05em]`.
- [ ] h1 clamps 2.1→3.4rem; "Command Center" exactly `dm-acc` brand blue; line-height 1.06.
- [ ] Sub max 54ch, muted, intl copy intact.
- [ ] CTA lifts + shadow-hover on hover; reduced-motion no lift.
- [ ] Stats row: `{closing} siswa closing • {roas} ROAS`, yellow bullet.
- [ ] Visual panel: radius 22, blur 14/150%, monogram 56px, two metric chips + yellow arrow (drop-shadow), footer `N modules • semua data live…`, 70px yellow radial `N` ball; panel shadow `dm-shadow-panel`.
- [ ] Stacks below 768: panel centered under text; nothing clips.

### E.4 Workspace cards
- [ ] 7 cards, registry order; icons 52px gradient tiles; `WORKSPACE` pill badge; title 1.08/700; desc muted 0.86.
- [ ] Hover: 6px lift, `shadow-lift`, `surface-strong`, 3px blue→yellow top bar fades IN (opacity 0→1).
- [ ] Whole card is one link; "Open Workspace →" affordance present; focus ring spans card; Tab order = visual order.

### E.5 Quick Insight
- [ ] 4 stats (Total Leads / Closing / Conversion / Ad Spend), 18px radius, auto-fit ≥190px; value 1.5/800; keys muted 0.8/600.
- [ ] Loading skeletons; empty shows `—`; error shows `ErrorState`+Retry.

### E.6 DataTable (where rendered)
- [ ] Sticky header, zebra rows, `overflow-x-auto` only, no page hscroll, `max-h` scroll bounds, empty → `EmptyState` row, error → `ErrorState`.
- [ ] Numeric columns right-aligned reading rhythm intact; `—` empty cells.

### E.7 Buttons & fields (all variants)
- [ ] primary/secondary/ghost/destructive render with distinct rests/hovers; disabled `opacity-50` no-hover; focus ring brand on all; reduced-motion disables lifts.

### E.8 Sections / footer / divider
- [ ] `SectionHeader` 4px yellow left bar, 1.18/800 title, 0.86 muted sub.
- [ ] Footer: blue DIGMARK/800/1.08, tagline, LPK line, top rule.
- [ ] Divider `rgba(0,88,163,0.12)` 1px.

### E.9 Motion/accessibility
- [ ] `prefers-reduced-motion: reduce` → all `translate-y` lifts become none (no jump); shimmer still pulses (transient, acceptable) or paused.
- [ ] Contrast: ink on `surface` ≥ 4.5:1; muted on `surface-strong` for labels ≥ 3:1 min (labels are 600-weight, not body-critical).
- [ ] Keyboard: full tab traversal + visible ring; all interactive nodes reachable.
- [ ] Copy: preserve EN/ID mix exactly; no forced anglicisation.

---

## F. Decisions Log

| # | Token / element | V3 value | V3.1 value | Rationale (Preserved / Changed) |
|---|---|---|---|---|
| 1 | Brand blue / blue_hover / yellow | `#0058A3` / `#0A6FBF` / `#FFDB00` | identical | **Preserved** — brand core. |
| 2 | ink / muted / grid / success / warn / danger | `#102A43` / `#5B6B7E` / `#E6EBF2` / `#22A06B` / `#E8930C` / `#D64550` | identical | **Preserved**. |
| 3 | Font | `@import` Manrope 400–800 | `next/font/google` Manrope, same weights | **Changed** (mechanism only) — offline/self-host + perf; glyphs identical. |
| 4 | Background | layered radial + 165° linear `#eef3fb→#f7f9fd→#fbf6e6`, fixed | same as token `dm-bg-glow`, applied to `<body>`-level fixed layer | **Preserved**. |
| 5 | Glass surface / strong / border | `.72`/`.85` alpha, blur 8–14/sat 140–150, white border `.9` | identical token family | **Preserved**. |
| 6 | Radius lg/md/pill (+ panel 22, chip 14, tile 16) | 20/14/999 + panel 22 | identical + named tokens | **Preserved**. |
| 7 | Shadows | `0 8px 22px` / `0 18px 38px` `rgba(0,88,163,.10/.20)` + CTA/panel/ball variants | identical token family | **Preserved**. |
| 8 | h1 hero clamp | `clamp(2.1rem,4.6vw,3.4rem)` lh 1.06 | identical | **Preserved**. |
| 9 | h1 module clamp | `clamp(1.7rem,3.4vw,2.5rem)` lh 1.1 | identical | **Preserved**. |
| 10 | Section h3 | `1.18rem/800`, 4px yellow left bar | identical | **Preserved**. |
| 11 | Homepage big sections | `1.9rem/800` | identical | **Preserved**. |
| 12 | Sidebar | `display:none` | no sidebar; index = nav | **Preserved** (V3 decision kept). |
| 13 | + Workspace sibling pill nav (workspace pages only) | n/a (native Streamlit multipage escape nav) | compact sibling-pill row on workspace pages | **Changed** (additive) — V3.1 loses Streamlit's implicit nav; avoids dead-ends without a sidebar. |
| 14 | Workspace grid | `auto-fill minmax(250px,1fr)` (`st.columns(3)` batch) | same auto-fill grid; let it flow | **Preserved** look; **Changed** rigid 3-batch → true responsive flow (justified: same target spacing, fewer fixed-column bugs). |
| 15 | Topbar | brand + Home, `1.12/800/tracking .05`, 15+9px dots, Home glass pill | identical | **Preserved**. |
| 16 | KPI MetricCard | `.dm-metric` glass, icon 34, label .82/600, value 1.6/800, delta .82/600 | identical | **Preserved**. |
| 17 | Quick Insight stat | `.dm-stat` 18px radius, key .8/600, value 1.5/800 | identical | **Preserved**. |
| 18 | Workspace card | glass, top 3px blue→yellow hover bar, 52px tile, badge, hover −6px | identical | **Preserved**. |
| 19 | Hero visual panel | monogram 56, panel 22px blur14/150, chips, yellow arrow, 70px ball | identical | **Preserved**. |
| 20 | Buttons/inputs polish | radius 12, surface bg, blue focus border | identical pattern | **Preserved**. |
| 21 | Reduced motion | `prefers-reduced-motion` kills lifts | Tailwind `motion-reduce:` | **Preserved**. |
| 22 | Dark mode | none in V3 | **excluded**; remove the Phase A `prefers-color-scheme:dark` block | **Changed** (removal) — V3 has no dark theme; glass recipe assumes light. |
| 23 | Copy language | EN/ID mix ("Explore…", "Pilih modul…", "semua data live", "Open Workspace", "LPK Duta Persada") | identical | **Preserved** — no forced English. |
| 24 | Data access | loader/cache in Streamlit process | `GET /api/tables/[key]` + `GET /api/meta/tabs` + auth, server-side cache TTL 300 | **Changed** (architectural, Phase C) — browser never touches Sheets. |
| 25 | Chart frame | `stPlotlyChart` glass 8px/140%, 18px radius | `ChartContainer` stable frame (Recharts later) | **Preserved** frame; wiring deferred. |
| 26 | Table | `st.dataframe` glass 8px, radius 16 | `DataTable` sticky header, zebra, overflow-x | **Preserved** look; **Changed** to sticky-native (justified: data-heavy pages). |

---

## Appendix — Implementation checklist for REX (acceptance before PR)

1. `styles/globals.css` exposes every token in §B (no magic hex/px in components). Remove Geist/zinc shell.
2. `app/layout.tsx` swaps Geist → Manrope `--font-manrope` → `--font-sans`; `lang="en"`; removes dark block.
3. `app/page.tsx` renders the §D.1 composition from `src/components/**` — no inline visual CSS.
4. All seven workspace pages share `Topbar` + `ModuleHero` + `WorkspaceNav` + `Footer`.
5. Every data fetch uses the shared `useApiTable`/fetch client with §D.2 states.
6. DataTable sticky-header + overflow pattern verified per §E.6.
7. `prefers-reduced-motion` honored globally.
8. Workspace card count & module order come from `MODULES` registry, not hardcoded.
9. Mock data gated behind `NEXT_PUBLIC_MOCK_DATA=1` only.