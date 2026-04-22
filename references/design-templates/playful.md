---
version: alpha
name: Playful Studio
description: Bright, soft, approachable — consumer product energy.
colors:
  primary: "#2B1E4E"
  secondary: "#7A6FB0"
  tertiary: "#FF6B6B"
  neutral: "#FFF8F0"
  accent-yellow: "#FFD166"
  accent-teal: "#4ECDC4"
  on-primary: "#FFF8F0"
typography:
  h1:
    fontFamily: Fraunces
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.02em
  h2:
    fontFamily: Fraunces
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.1
  body-md:
    fontFamily: Nunito
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.6
  label-md:
    fontFamily: Nunito
    fontSize: 0.875rem
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: 8px
  md: 16px
  lg: 24px
  full: 9999px
spacing:
  xs: 6px
  sm: 12px
  md: 20px
  lg: 32px
  xl: 56px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 14px
---

## Overview

Friendly, rounded, warm. The UI should feel like a well-made toy — pleasing to
touch, with just enough playfulness to make routine tasks inviting.

## Colors

Coral drives delight. Teal and yellow are secondary delight moments — confetti
touches, illustration, empty states.

## Typography

**Fraunces** (serif display) for headings, **Nunito** (rounded sans) for body.
Contrast between the two is the signature.

## Shapes

Generous rounding. 16px default, 24px for cards, pill shape for buttons.

## Do's and Don'ts

- Do use accent-yellow and accent-teal sparingly, as accents, never as text.
- Don't stack more than two rounded cards in a single column — it gets mushy.
- Do lean on whitespace; cramped layouts kill the vibe.
- Don't use ALL CAPS on long labels; save it for <=3-word tags.
