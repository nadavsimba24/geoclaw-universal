---
version: alpha
name: Corporate Neutral
description: Calm, trustworthy, high-information-density enterprise UI.
colors:
  primary: "#0F172A"
  secondary: "#475569"
  tertiary: "#2563EB"
  neutral: "#FFFFFF"
  surface: "#F8FAFC"
  on-primary: "#FFFFFF"
  error: "#DC2626"
typography:
  h1:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.2
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
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.02em
rounded:
  sm: 4px
  md: 6px
  lg: 10px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  gutter: 16px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Overview

Enterprise-grade clarity. Favor function over ornament. Dense tables and
dashboards are the norm; padding is modest; shapes are calm.

## Colors

- **Primary (#0F172A):** Slate ink for primary text.
- **Secondary (#475569):** Quiet gray for meta and secondary surfaces.
- **Tertiary (#2563EB):** Blue for links, selection, and primary CTAs.
- **Surface (#F8FAFC):** Subtle elevation vs. pure-white content.

## Typography

**Inter** end to end. Three sizes (h1, body-md, label-md) cover 90% of cases.

## Layout

8px grid. Prefer 12–16px padding for dense panels, 24px for cards.

## Do's and Don'ts

- Do keep button labels short and unambiguous ("Save", not "Submit form").
- Don't use shadow as the primary elevation cue — prefer borders and surface.
- Do align numeric columns right; currency with ISO codes.
- Don't introduce a second accent color without a semantic reason.
