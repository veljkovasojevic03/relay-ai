# Relay AI style guide

**Mood:** a friendly shop counter, not a SaaS control room. Light, warm, human.
**Avoid:** purple gradients, glassmorphism, "AI sparkle" icons, dark-premium styling.

Tokens live in [`src/app/globals.css`](../src/app/globals.css) as CSS variables and are exposed
to Tailwind through `@theme inline` (`bg-primary`, `text-muted-foreground`, …). shadcn/ui
components use the same variables. **`src/lib/design/contrast.test.ts` reads the real tokens
and fails CI if a text pair drops below WCAG AA.** Update this table when you change a value.

## Color

| Token                 | Value     | Use                                           |
| --------------------- | --------- | --------------------------------------------- |
| `background`          | `#FBF7F2` | Page background (warm cream)                  |
| `foreground`          | `#1F1A17` | Body text, headings (warm near-black ink)     |
| `card` / `popover`    | `#FFFDF9` | Raised paper surfaces                         |
| `muted` / `secondary` | `#F3ECE3` | Quiet fills, bot chat bubbles                 |
| `muted-foreground`    | `#6B5D52` | Secondary text, captions                      |
| `primary`             | `#B3472B` | Terracotta accent: primary buttons, links     |
| `primary-hover`       | `#9A3B22` | Hover/pressed state of primary                |
| `primary-foreground`  | `#FFFFFF` | Text on primary                               |
| `accent`              | `#F7E6D3` | Soft amber tint: badges, icon tiles           |
| `accent-foreground`   | `#6B2E17` | Text on accent                                |
| `accent-strong`       | `#E0913F` | Decorative only (logo, charts). Not for text  |
| `success`             | `#2F6B45` | Success text and icons                        |
| `destructive`         | `#B42318` | Errors, destructive actions (white text)      |
| `border`              | `#E6DACB` | Hairline borders (decorative, see note)       |
| `input`               | `#958270` | Form control borders (≥ 3:1 on every surface) |
| `ring`                | `#C2562F` | Focus outline (2px, offset 2px)               |

Charts: `chart-1…5` = terracotta, amber, green, warm grey, sand. Pair every series with a label
or pattern, never color alone.

### Verified contrast (WCAG 2.x)

| Pair                                | Ratio  | Requirement   |
| ----------------------------------- | ------ | ------------- |
| foreground / background             | 16.2:1 | AA text 4.5   |
| muted-foreground / background       | 5.9:1  | AA text 4.5   |
| muted-foreground / muted            | 5.4:1  | AA text 4.5   |
| primary-foreground / primary        | 5.5:1  | AA text 4.5   |
| primary-foreground / primary-hover  | 7.0:1  | AA text 4.5   |
| primary / background (links)        | 5.1:1  | AA text 4.5   |
| accent-foreground / accent          | 8.5:1  | AA text 4.5   |
| success / background                | 6.0:1  | AA text 4.5   |
| ring / background                   | 4.2:1  | AA non-text 3 |
| input / background (control border) | 3.5:1  | AA non-text 3 |
| input / muted                       | 3.1:1  | AA non-text 3 |

`border` (1.3:1) is decorative. Anything that has to be seen as a control boundary (inputs,
toggles) uses `input` plus a label, and focus always uses `ring`.

## Typography

| Role    | Family                    | Token          | Notes                                                         |
| ------- | ------------------------- | -------------- | ------------------------------------------------------------- |
| Display | **Fraunces** (soft serif) | `font-display` | Headings, wordmark. Static 600 only (see DECISIONS, Phase 12) |
| UI/body | **Instrument Sans**       | `font-sans`    | Default for everything else                                   |

Both load through `next/font/google` with `latin` + `latin-ext` (needed for č ć š ž đ).
Scale: h1 `text-4xl → sm:text-6xl`, h2 `text-3xl`, body `text-base`/`text-lg` lead, captions
`text-sm`/`text-xs`. Headings use `tracking-tight` and `text-balance`.

## Shape and depth

- Radius base `--radius: 0.875rem`. Cards `rounded-xl`, panels `rounded-3xl`, pills `rounded-full`.
- Chat bubbles: `rounded-2xl` with the corner nearest the speaker at `rounded-*-md`.
- Paper-like depth: hairline `border` plus `shadow-card` (a soft, low, warm shadow). No blur
  backdrops.

## Motion (`motion`, from Phase 5/12)

Gentle and purposeful: bubbles settle in (short y-offset and fade, ~200 ms), the widget panel
opens with a scale from the launcher corner, typing dots, and a hand-off animation (a bubble
passes to a person avatar). Landing sections reveal on scroll. **Everything honors
`prefers-reduced-motion`.** A global rule in `globals.css` also neutralizes CSS transitions.

## Accessibility

- Visible focus on every interactive element (`:focus-visible` outline in `ring`).
- Labelled controls; icon-only buttons get `aria-label`; decorative icons get `aria-hidden`.
- Never rely on color alone (status pills carry text).

## Voice

Short, plain, kind. Speak to one shop owner ("you" / "ti"), never "teams". In Serbian use Latin
script and the informal "ti". Empty states teach the next step, for example an empty FAQ list
offers "add your first 3 questions".

## Separate looks

- **Widget:** inherits nothing from this theme. Its colors are derived from the bot's
  `brand_color` (readable foreground computed automatically), and it works on light and dark
  host pages.
- **Demo store "Kroj":** has its own identity (Phase 9), so it reads as a third-party site.
