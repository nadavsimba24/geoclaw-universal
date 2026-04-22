---
version: alpha
name: Heritage Editorial
description: Architectural minimalism meets journalistic gravitas.
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
  on-primary: "#F7F5F2"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  h2:
    fontFamily: Public Sans
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.15
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.1em
rounded:
  none: 0
  sm: 4px
  md: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview

A premium matte finish. The UI evokes a high-end broadsheet or contemporary
gallery — quiet, confident, and slow to reveal itself. Use generous negative
space; let typography do the hierarchy work.

## Colors

High-contrast neutrals with a single accent.

- **Primary (#1A1C1E):** Deep ink for headlines and core text.
- **Secondary (#6C7278):** Slate for borders, captions, metadata.
- **Tertiary (#B8422E):** "Boston Clay" — reserved for primary actions.
- **Neutral (#F7F5F2):** Warm limestone — softer than pure white.

## Typography

Two families: **Public Sans** for narrative, **Space Grotesk** for labels.

- **Headlines** in Public Sans Semi-Bold.
- **Body** at 16px, line-height 1.6.
- **Labels** uppercase with wide tracking.

## Shapes

Architectural sharpness. 4px corner radius everywhere. Full-round only for
avatar/chip pills.

## Do's and Don'ts

- Do reserve Boston Clay for the single most important action per screen.
- Don't mix two accent colors in one view.
- Do maintain WCAG AA contrast (4.5:1 for body text).
- Don't use more than two type weights in one viewport.
