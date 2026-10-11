---
name: Pension-Pal
description: A dark-first, data-dense Swiss retirement planner where every number is traceable and the accent glows like a lamp on a night desk.
colors:
  accent: "#3b82f6"
  bg: "#0d0e12"
  surface: "#13141a"
  surface-2: "#1a1b23"
  fg-1: "#f0f1f5"
  fg-2: "#b4bfcc"
  fg-3: "#8896a8"
  green: "#4ade80"
  red: "#f87171"
  yellow: "#fbbf24"
typography:
  display:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 100
    lineHeight: 1
    letterSpacing: "normal"
  figure:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 300
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "'Fira Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
  2xl: "10px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input-field:
    backgroundColor: "rgba(var(--tw-slate-800), 0.8)"
    textColor: "{colors.fg-1}"
    rounded: "{rounded.lg}"
    padding: "8px"
  rail-button-active:
    backgroundColor: "rgba(59, 130, 246, 0.15)"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  seg-button-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg-1}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

# Design System: Pension-Pal

## Overview

**Creative North Star: "The Night Desk"**

A banker's desk after hours: a dark room, documents laid out side by side for one decision, and a single pool of light that falls exactly where attention is needed. Pension-Pal is that desk. The interface stays quiet and dark so the numbers — pensions, tax, scenarios — carry the light. Everything on screen earns its place: no decoration, no noise, every figure traceable to a document, a profile field, or an official table.

The system is precise, premium, calm, and human. Precise: aligned figures, Swiss number formatting, tabular data everywhere. Premium: one confident accent, generous craftsmanship in the details (hairline rings, deliberate focus states, choreographed but restrained motion). Calm: dark by default, low saturation, no competing colors. Human: warm under the hood — copy speaks plainly to 55+ readers, errors explain recovery, nothing is hidden behind jargon.

This is a sister of Budget-Pal, Fintools, and Application-Pal: same rail navigation, same token architecture, same settings patterns. Visual decisions that break family resemblance need explicit justification.

**Key Characteristics:**
- Dark-first (dark is the default; light mode is a fully equal citizen, not an afterthought)
- Data-dense and compact; whitespace is spent on grouping, never on padding
- One accent hue; semantic green/red/yellow appear only as meaning, never as decoration
- Fira Sans (self-hosted, four weights: Thin, Light, Normal, Bold); sentence case everywhere
- Every padding, margin and gap sits on the 4 px grid
- Depth through tonal layering; shadows are dark, offset, and rare
- Motion is short, purposeful, and honors `prefers-reduced-motion`

## Colors

The palette is a dark study in cool slate with a single blue accent — lamplight on a night desk. Dark values are the normative defaults; every color resolves to an AA-compliant value in light mode via the `[data-theme="light"]` overrides in `styles.css`.

### Primary
- **Banker's Blue** (#3b82f6): the one accent. Active rail item, primary buttons, selected chips, chart leads, focus rings, links. Its rarity is the point — it marks the current decision, never wallpaper.

### Secondary / Tertiary
- None. The system deliberately has one accent. Do not introduce a second.

### Neutral
- **Night Desk** (#0d0e12): app background (`--bg`).
- **Desk Pad** (#13141a): raised surfaces — cards, panels, the rail (`--surface`).
- **Felt Pad** (#1a1b23): recessed tracks and wells — segmented-control tracks, inset areas (`--surface-2`).
- **Paper White** (#f0f1f5): primary text (`--fg-1`).
- **Lamplight** (#b4bfcc): secondary text, rail items (`--fg-2`).
- **Dusk** (#8896a8): tertiary text — hints, section labels, placeholders (`--fg-3`). Dark value passes AA (6.4:1); light value is #5f6b7a (≥4.9:1).
- **Hairline** (rgba(255,255,255,0.1) dark / rgba(15,17,22,0.1) light): all borders and dividers (`--border`, `--border-2` at half weight).

### Semantic (meaning only)
- **Ledger Green** (dark #4ade80 / light #15803d): gains, positive deltas, "on track".
- **Ink Red** (dark #f87171 / light #b91c1c): losses, errors, destructive actions.
- **Brass Yellow** (dark #fbbf24 / light #b45309): warnings, gaps, attention needed.

### Named Rules
**The One Voice Rule.** Banker's Blue appears on ≤10% of any screen. It marks the current decision — the active rail item, the primary action, the selected state. If everything glows, nothing does.

**The Meaning Rule.** Green, red, and yellow encode financial meaning only. Never use them for decoration, branding, or chart variety beyond the categorical set.

**The Two-Theme Rule.** Every surface, text, and accent color must resolve to an AA-compliant value in both dark and light. Add the value pair to `styles.css` tokens, never a one-off hex in a component. In light mode the depth reverses: surfaces are tinted (bg #ebe9e4, surface #f3f2ee, surface-2 #eeece7) and input wells fade to white (`--well: #ffffff`), so fields stay clearly visible on cards — never white wells on white cards.

## Typography

**Font:** Fira Sans, self-hosted via `@fontsource/fira-sans` (no request to Google), in exactly four weights: Thin 100, Light 300, Normal 400, Bold 700. Classes asking for 500 render as Normal, 600 as Bold.

**Character:** quiet instrument typography. Large type goes *lighter*, small type goes *bolder*, so size and weight pull in opposite directions and each level is recognisable at a glance. Sentence case everywhere: no uppercase labels, no letter-spaced caps. Codes the user types (invite codes) are the only uppercase text.

### Hierarchy
- **Display** (Thin 100, 28px, 1): the one headline figure per view (total income on the chart).
- **Figure** (Light 300, 20–24px): key figures in KPI cards, Monte Carlo percentiles, allocation results.
- **Headline** (Light 300, 20px): view titles (`h1`).
- **Title** (Bold 700, 12px): section and card headings.
- **Body** (Normal 400, 14px, 1.45): default text, form values, explanations.
- **Label** (Normal 400, `--fs-2xs`/`--fs-xs`): field labels, hints, table headers, rail section labels — 10/11 px in Compact, 12/13 px in Comfort.

### Density
Two densities, switched in the rail (`data-density` on `<html>`). Every font size and the panel/box padding come from tokens in `styles.css`; Tailwind `text-*` and `p-section` / `p-box` / `p-box-sm` map to them.

| Token | Tailwind | Compact (Professional) | Comfort | Typical use |
|---|---|---|---|---|
| `--fs-2xs` | `text-2xs` | 10px | 12px | labels, hints, chart ticks |
| `--fs-xs` | `text-xs` | 11px | 13px | secondary text, table cells |
| `--fs-sm` | `text-sm` | 12px | 14px | body in cards, inputs, buttons |
| `--fs-base` | `text-base` | 14px | 16px | body |
| `--fs-lg` | `text-lg` | 16px | 18px | — |
| `--fs-xl` | `text-xl` | 20px | 22px | view titles (Light), figures |
| `--fs-2xl` | `text-2xl` | 24px | 26px | KPI figures (Light) |
| `--fs-3xl` | `text-3xl` | 28px | 30px | headline figure (Thin) |
| `--pad-section` | `p-section` | 8px | 12px | sections, cards |
| `--pad-box` | `p-box` | 8px | 12px | boxes inside cards |
| `--pad-box-sm` | `p-box-sm` | 4px | 8px | small boxes, KPI cards (vertical) |

**The Comfort Floor Rule.** Comfort is the accessible default: every size is Compact + 2 px and nothing renders below 12 px (chart text and `<small>` included). Compact trades 4 px of padding and 2 px of type for density; its floor is 10 px.

### Named Rules
**The Instrument Rule.** Numbers in tables and comparisons use tabular figures and right alignment; money follows Swiss formatting (1'234.50). Never center a column of numbers.

**The Floor Rule.** Comfort: 12px floor for everything. Compact: 10px floor for labels and ticks, 12px for body text in cards.

**The Sentence-Case Rule.** Headings, labels, buttons and table headers are written in sentence case and never transformed with `uppercase`. Acronyms (AHV, BVG, CHF) stay as they are.

**The 4-Pixel Rule.** Padding, margin and gap are multiples of 4 px (`--sp-*`, Tailwind whole steps — no `*-0.5/1.5/2.5/3.5`). Sections pad 12 px, boxes inside them 8–12 px; text gets the room, not the frame.

## Layout

A fixed left rail (220 px expanded, 52 px collapsed) beside a single scrolling content well. The rail holds brand, navigation, density/theme/language controls, and the user account; the well renders exactly one view at a time (dashboard, analysis, cockpit, montecarlo, knowledge, import/export).

Density is user-selectable (comfort / pro) and changes type sizes, field padding, and card padding via `.density-comfort` / `.density-pro` scope classes — it is a first-class layout mode, not a zoom.

Forms use a 3-column grid that collapses 3→2→1 (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) with 12 px gutters. Cards group related fields with 10 px internal padding (pro) / 16 px (comfort).

**Responsive posture:** the app is designed desktop-first — its real use scene is a desk with documents and a large screen. Breakpoints are Tailwind defaults (sm 640 / md 768 / lg 1024 / xl 1280), used sparingly (≈47 modifiers app-wide) inside views. A dedicated mobile shell is known gap, scheduled under `$impeccable adapt`.

**The Grouping Rule.** Whitespace is spent between groups, not inside them: 4–8 px inside a control, 12–16 px between fields, 24–28 px between sections. Tight internals, clear separation.

## Elevation & Depth

Depth is conveyed primarily by tonal layering — bg → surface → surface-2 — with hairline borders, not shadows. Shadows are dark, carry a vertical offset, and appear only on transient or topmost layers (modals, popovers, active segmented buttons).

### Shadow Vocabulary
- **Modal** (`0 24px 64px rgba(0,0,0,0.55)` dark / `0 24px 64px rgba(15,17,22,0.16)` light): dialogs, the account popover, the settings modal.
- **Card** (`0 1px 2px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.32)` dark / two-layer faint light shadow): resting cards; subtle enough to read as material, not float.
- **Active control** (`0 1px 4px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12)` dark): the selected segmented-button pill rising off its track.

### Named Rules
**The Lamplight Rule.** In dark mode, depth is a shadow, not a halo: dark, offset, blurred. Zero-offset colored glows are forbidden as elevation (accent-tinted glows on the brand mark and chart emphasis filters are the only exceptions, and they answer to brand/meaning, not depth).

**The Flat-By-Default Rule.** Resting surfaces are flat: tonal step + hairline border. A shadow announces "this floats above everything" — reserve it for modals, popovers, and the one active control.

## Shapes

Corners are restrained and tight: controls 3–4 px, cards 6–8 px, large shells 10 px, pills (999 px) only for actual pills — segmented options, toggles, avatar, the save-state indicator. No sharp rectangles (0 radius) and no decorative geometry. Borders are always 1 px hairlines; a 3 px left accent bar on the active rail item is the single allowed heavy edge — it is wayfinding, not decoration.

**The Three-Tone Rule.** Boxes use exactly three neutral tones: page `bg-bg`, section/card `bg-surface`, box inside a card `bg-surface-2`; a box inside that goes transparent with a hairline. Tinted backgrounds are reserved for status — amber warning, rose/red error, emerald success — never for decoration (no cyan, indigo or sky panels).

**The Hairline Rule.** One-pixel borders at the token `--border` weight separate every surface. If a separation needs more than a hairline, use a tonal step instead of a heavier line.

## Components

### Buttons
- **Shape:** slightly rounded (6 px / `rounded-lg`).
- **Primary:** Banker's Blue background, white semibold 14 px text, `10px 16px` padding; hover lightens to #60a5fa (blue-400) with a 150 ms color transition.
- **Ghost/secondary:** text-link style (blue-400, underline on hover) for low-emphasis actions; destructive text in Ink Red.
- **Focus:** `focus:ring` blue at 40% opacity on form controls; buttons rely on the browser outline — a known gap tracked for `$impeccable polish`.

### Inputs / Fields
- **Style:** 1 px slate-600 border, slate-800/80 fill, 6 px radius, 8×12 px padding, 14 px text, Dusk placeholder.
- **Focus:** border shifts to Banker's Blue + 1 px ring at 40% opacity.
- **Error:** rose-500 border + rose-300 11 px message below the field.

### Navigation (the rail)
- 220 px vertical rail, Desk Pad background, hairline right border; collapses to 56 px with a 220 ms width transition (the one sanctioned layout-property animation).
- Items: 12.5 px Lamplight text, 5×10 px padding, 3 px radius; hover tints to accent-08; active gets accent-08→15 background, Banker's Blue text, and a 3 px left accent bar.
- Footer: density segmented control, theme row, language toggle (de/en flags), user avatar opening the account popover.

### Segmented controls / chips
- Track: Felt Pad well with hairline border; options 11 px semibold Dusk text.
- Active: Paper White on Desk Pad, offset shadow + hairline ring (see Elevation).
- Filter chips: 11 px, slate-700 border; active commits the accent at 20% background + 50% border.

### Cards / Containers
- **Corner:** 12–18 px. **Background:** Desk Pad or a slate-800/65 tonal step. **Border:** hairline. **Padding:** 10 px (pro) / 16 px (comfort). **Shadow:** resting cards use the faint card shadow only when layered over busy content; flat is the default.

### Charts (signature component)
- Recharts-based, theme-aware through `constants/chartColors.ts`: colors are read from computed CSS variables and re-read on a `MutationObserver` when `data-theme` flips. Categorical palette: Banker's Blue first, then violet, emerald, amber, red, cyan — order is fixed, meaning comes from position.
- Tooltips: compact slate-950 panel, hairline border, 10 px text; bars and segments glow white on hover/active via drop-shadow filters (chart emphasis is the sanctioned exception to The Lamplight Rule).

## Do's and Don'ts

### Do:
- **Do** route every color through the `styles.css` tokens (`--bg`, `--surface`, `--fg-1..3`, `--accent*`, semantic `--green/--red/--yellow`) and every chart color through `chartColors.ts`.
- **Do** keep dark and light values paired in `styles.css` when adding a token.
- **Do** use `data-theme` theming; the `dark:` Tailwind variant is not used in this project.
- **Do** use the rail, segmented-control, and popover patterns from `styles.css` (`rail-btn`, `seg-btn`, `popover-smooth`) — they carry the documented motion contract.
- **Do** write numbers in Swiss format and align them right in tables.

### Don't:
- **Don't** introduce hues beyond Banker's Blue + the three semantic colors. No purple branding, no teal accents.
- **Don't** hard-code hex values in components — including chart strokes (the audit found `#fbbf24`, `#3b82f6`, `#94a3b8` inline in `Analysis.tsx`; route them through `chartColors.ts` during `$impeccable colorize`).
- **Don't** use zero-offset glow shadows for elevation in dark mode.
- **Don't** animate layout properties (width/height/padding) except the rail width transition.
- **Don't** use the `dark:` class variant or set `darkMode`-dependent classes; theming is exclusively `[data-theme="light"]` overrides on tokens.
- **Don't** fill empty or missing values with example data — missing stays empty (Product Principle 3: honest models).
