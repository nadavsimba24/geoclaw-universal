---
version: alpha
name: Brutalist Grid
description: Hard edges, raw grid, maximum contrast.
colors:
  primary: "#000000"
  secondary: "#4A4A4A"
  tertiary: "#FF3B00"
  neutral: "#FFFFFF"
  on-primary: "#FFFFFF"
typography:
  h1:
    fontFamily: Space Mono
    fontSize: 3.25rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.02em
  h2:
    fontFamily: Space Mono
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1
  body-md:
    fontFamily: Space Mono
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Space Mono
    fontSize: 0.75rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
rounded:
  none: 0
  sm: 0
  md: 0
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.none}"
    padding: 12px
---

## Overview

Raw, confrontational, monospaced. Nothing soft. A page should read like a
terminal transcript that happens to be beautiful.

## Colors

Pure black and pure white. **Tertiary (#FF3B00)** is the only color and is used
as alarm-level emphasis — one element per screen, max.

## Typography

A single monospace family (**Space Mono**) handles everything. Size and weight
create hierarchy, not family contrast.

## Shapes

Zero rounding on every rectangle. Pill only on status chips.

## Do's and Don'ts

- Do use 2px solid borders instead of shadows — elevation is a lie.
- Don't use any color gradient. Flat fills only.
- Do right-align or left-align text; never center body text.
- Don't mix this with soft-UI elements — it breaks the promise.
