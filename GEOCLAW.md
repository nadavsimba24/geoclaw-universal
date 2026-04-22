---
version: alpha
name: Geoclaw CLI
description: Terminal-native agent platform with calm violet, teal, and orange accents.
colors:
  primary: "#1B1B1F"
  secondary: "#8A8A94"
  tertiary: "#FF8C3C"
  violet: "#B292D6"
  teal: "#56C2C2"
  rose: "#F29FC4"
  neutral: "#F7F5F2"
  surface: "#111215"
  on-primary: "#F7F5F2"
  on-surface: "#EDEEF1"
  error: "#E5484D"
  warning: "#F3C969"
  success: "#7EC28E"
typography:
  h1:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  h2:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.08em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 32px
components:
  prompt-cursor:
    textColor: "{colors.teal}"
  agent-marker:
    textColor: "{colors.tertiary}"
  tool-marker:
    textColor: "{colors.violet}"
  header:
    textColor: "{colors.violet}"
  dim-note:
    textColor: "{colors.secondary}"
---

## Overview

Geoclaw's identity is **the terminal, taken seriously**. It is calm by default,
with one warm accent for attention and a violet/teal pair for structure.
The palette is chosen so it survives both light and dark terminals —
the primary content reads as ink, never fluorescent.

The shape of the CLI is three speakers:

- **you** in teal — the user's prompt.
- **geoclaw** in orange — the agent's reply.
- **⚙ tools** in violet — what the agent actually did.

Anything else (timings, token counts, retry notices) is dimmed gray.

## Colors

- **Primary (#1B1B1F):** Terminal ink. Only used in web renderings of Geoclaw.
- **Tertiary (#FF8C3C):** Warm orange — the agent voice, the spinner, the
  primary-action color on web surfaces.
- **Violet (#B292D6):** Structure and headers, plus tool-call markers. Not an
  action color — never put it on a clickable CTA.
- **Teal (#56C2C2):** The human's voice, cursor, and hint color. Also used for
  inline code rendering in chat replies.
- **Neutral (#F7F5F2):** Light warm surface for web renderings.
- **Surface (#111215):** Dark surface — the implied backdrop for the terminal.

## Typography

- **Inter** for any web-facing text that wraps (docs, landing pages).
- **JetBrains Mono** for anything that represents terminal output, commands,
  tool names, or code. Use mono for brand marks too — Geoclaw is a CLI first.

## Layout & Spacing

The terminal enforces a 1ch grid. On the web, the 4/8 pixel scale applies.
Leave one blank line of breathing room between the prompt and the agent reply.
Tool-call blocks indent 2 spaces to signal "this happened inside the reply".

## Elevation & Depth

There is no elevation. Nothing floats. Separation comes from color and
whitespace. When the web surface must group content, use a 1px border in
`secondary` — never a shadow.

## Shapes

- 8px radius on cards and inputs.
- 12px radius on the chat surface.
- 0 radius on the terminal itself — it is what it is.

## Components

- **prompt-cursor:** Teal `▌` before the `you ›` label.
- **agent-marker:** Orange `▌` before the `geoclaw ›` label.
- **tool-marker:** Violet `⚙` before a tool name; the name is bold, args dim.
- **header (banner):** Violet box-drawing frame; title bold, tag dim.

## Do's and Don'ts

- Do reserve orange (`tertiary`) for the agent's voice and one CTA per screen.
- Don't use violet on clickable elements; it reads as structure, not action.
- Do keep "dim" (secondary) for metadata — timings, hints, tool-result previews.
- Don't introduce a second accent color. If you need emphasis, use weight or
  bold teal, not a new hue.
- Do fall back to plain text when `NO_COLOR` or a non-TTY stream is detected.
- Don't use emoji as the primary signal — every emoji must have a text fallback.
