---
name: Neato Ventures
description: Atomic-age Googie showroom for an AI software, hardware, and consulting firm; cream ground, teal and burnt-orange signals, Space Mono uppercase display.
colors:
  cream: "hsl(50 33% 95%)"
  card-cream: "hsl(50 25% 92%)"
  muted-cream: "hsl(45 20% 88%)"
  deep-brown: "hsl(17 35% 12%)"
  retro-brown: "hsl(17 40% 36%)"
  muted-brown: "hsl(17 20% 40%)"
  border-taupe: "hsl(17 15% 78%)"
  teal: "hsl(179 52% 52%)"
  burnt-orange: "hsl(12 93% 58%)"
  mustard: "hsl(45 87% 62%)"
  showroom-teal-ink: "#3eabab"
  showroom-ink-soft: "#5f493b"
  showroom-ink-mute: "#796553"
  showroom-ink-edge: "#4a3629"
  device-ring-glow: "#5ecebc"
typography:
  display:
    fontFamily: "Space Mono, monospace"
    fontSize: "clamp(1.875rem, 1.1rem + 2.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "0.05em"
  headline:
    fontFamily: "Space Mono, monospace"
    fontSize: "clamp(1.5rem, 1.1rem + 1.4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
  title:
    fontFamily: "Space Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.02em"
  body:
    fontFamily: "Outfit, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Space Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.15em"
  micro:
    fontFamily: "Space Mono, monospace"
    fontSize: "0.65rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.2em"
rounded:
  chip: "3px"
  stamp: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  pill: "50%"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.5rem"
  lg: "2rem"
  xl: "3rem"
  section: "5rem"
components:
  button-cta:
    backgroundColor: "{colors.burnt-orange}"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.25rem"
    height: "40px"
  button-cta-hover:
    backgroundColor: "{colors.burnt-orange}"
    textColor: "{colors.cream}"
  button-outline:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.deep-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.25rem"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.deep-brown}"
  button-hero:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 2rem"
  button-hero-outline:
    backgroundColor: "transparent"
    textColor: "{colors.teal}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 2rem"
  button-hero-outline-hover:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.cream}"
  button-retro:
    backgroundColor: "{colors.retro-brown}"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.25rem"
  card-googie:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.deep-brown}"
    rounded: "{rounded.lg}"
    padding: "2rem"
  card-googie-hover:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.deep-brown}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.muted-brown}"
    typography: "{typography.label}"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.teal}"
  input-configurator:
    backgroundColor: "#fbf8ee"
    textColor: "#2a1a13"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 1.4cqw"
  band-closing:
    backgroundColor: "{colors.retro-brown}"
    textColor: "{colors.cream}"
    padding: "5rem 0"
---

# Design System: Neato Ventures

## Overview

**Creative North Star: "The Tomorrowland Dealer Showroom"**

Neato's world is 1950s/60s Googie optimism made into a working website: a warm cream ground, chrome and teal glow, burnt-orange signage, and the atom mark turning slowly behind everything. It is a print-era world (brochures, dealer trim sheets, data plates, stamped labels) rendered with a CRT scanline over the imagery. The tone is confident and lightly playful; the density is generous, with sections breathing at 5rem and cards holding their content in 2rem of padding.

The wearables build extended this world into a physical showroom. The device sits on a chrome plinth like a car on a turntable, the buyer's company is the trim level, and every lower section is a brochure page: a spec sheet on a data plate, an atom-diagram model line, a trim-sheet table, a numbered order process. Nothing in the extension introduced a new palette or face; it hard-measured the incumbent language into a composition that scales as one object.

Confirmed rejections: the icon-grid feature list (the wearables page refuses it), glass or blur surfaces, soft ambient drop shadows on cards (the card language is a hard offset), and system or generic display faces.

**Key Characteristics:**
- Cream paper ground with a slightly deeper cream for cards and bands; brown is the ink, never gray.
- Two signals: teal for structure and status, burnt orange for the action and the tagline. Mustard is a third, rarer warmth.
- Space Mono uppercase for every heading, label, nav item, and stamp; Outfit for reading text.
- Googie cards: 2px border, hard 5px offset brown shadow, lift toward the top-left on hover.
- Scanlines over imagery, starburst radial washes behind bands, atom rings as the recurring diagram and ornament.
- Motion is one gesture: fade-up on first view, plus slow orbits and a float on the atom mark.

## Colors

A warm, low-contrast paper palette carrying two saturated mid-century signals; brown does the work gray would do elsewhere.

### Primary
- **Turquoise Teal** (`--teal`, also `--primary` and `--ring`): structure and status. Nav active state, section-card titles, spec labels, eyebrows on incumbent pages, focus rings, atom rings, the device's glowing face ring, step numbers, dashed process line, and the hero/hero-outline buttons.

### Secondary
- **Burnt Orange** (`--burnt-orange`, also `--destructive`): the action and the promise. The `cta` button, the wordmark underscore, taglines under headlines (with an orange text glow), the "Shipping now" status, the AVAILABLE NOW ribbon, and the atom mark on closing bands. Rare on any one screen; that rarity is the signal.

### Tertiary
- **Mustard** (`--mustard`, also `--accent`): warmth and the "in development" status. The starburst wash center, the dashed counter-rotating atom ring, the Vision card icon, the middle stop of the retro text gradient. Never a button fill.

### Neutral
- **Cream** (`--cream`, `--background`): page ground and the text color on brown or orange.
- **Card Cream** (`--card`): cards, band sections, nav on scroll (with blur), sidebar.
- **Muted Cream** (`--muted`): ghost-button hover fills only.
- **Deep Brown** (`--foreground`): headings and body ink.
- **Retro Brown** (`--retro-brown`, `--secondary`): closing bands, the footer, the retro button, the outline button's border, every hard offset shadow (at 0.15 to 0.4 alpha), and dashed rules (0.35 alpha).
- **Muted Brown** (`--muted-foreground`): body copy inside cards, inactive nav links, notes.
- **Border Taupe** (`--border`, `--input`): 2px card and band borders, nav and footer edges.

### Showroom inks (scoped to `.showroom`)
The wearables hero is composited over generated raster plates, so it carries a set of literal inks tuned to read on the cream-washed cityscape rather than on flat paper: **Showroom Teal Ink** for the eyebrow, focus outlines and spark icon; **Ink Soft** and **Ink Mute** for spec labels and the lede; **Ink Edge** for the worn strip and configurator borders and bold spec values; and **Device Ring Glow** for the 3D ring and the printed-name label. These are legitimate in the stage and the strip directly under it. They are not a second palette for new pages: below the hero, the wearables sections return to the HSL tokens.

### Named Rules
**The Brown Ink Rule.** There is no gray. Every dark, border, divider, and shadow is a brown at some alpha (`--foreground`, `--retro-brown`, `--border`). A neutral gray in a new surface is a defect.

**The Two Signals Rule.** Teal structures; orange acts. A primary action is orange, a status or heading accent is teal. Mustard only marks "in development" or warms a wash. Never put two orange fills in the same viewport except a CTA pair where the second is an outline.

**The Cream-on-Brown Band Rule.** Closing bands and the footer invert to retro brown with cream text, keep the starburst wash, and put the orange tagline glow (`0 2px 6px rgba(247,90,51,0.4)`) under the subhead.

## Typography

**Display Font:** Space Mono (with monospace fallback)
**Body Font:** Outfit (with sans-serif fallback)
**Label/Mono Font:** Space Mono (same as display)

**Character:** A typewriter-terminal display face set wide and uppercase, against a geometric humanist body. The display face carries the whole retro voice; Outfit stays out of the way. Space Mono is the pinned display face; it is loaded from Google Fonts in `src/index.css` and also drawn into the 3D device's back-label canvas texture.

### Hierarchy
- **Display** (700, `text-3xl` to `text-5xl` on page heroes; the home wordmark alone runs `text-6xl` to `text-9xl` with the retro gradient; the showroom headline is `3.84cqw` at line-height 1.12 and `0.06em` tracking): page H1 only.
- **Headline** (700, `text-2xl` to `text-3xl` or `clamp(1.5rem, 1.1rem + 1.4vw, 2rem)`, balanced wrap): section H2, centered over a 34 to 40rem lede.
- **Title** (700, `text-sm` in cards, `text-xs` on product tiles, `1.1rem` in the shape panel): card and panel H3. Card titles on band sections are teal.
- **Body** (400, `1rem` at 1.6; `text-sm` at 1.55 to 1.65 inside cards; `text-lg` semibold for hero taglines): Outfit. Copy columns cap at `max-w-lg` to `max-w-2xl`.
- **Label** (700, `text-xs` / 0.75rem, `0.15em` to `0.35em` tracking, uppercase): nav links, eyebrows, footer column heads, button text, table headers.
- **Micro** (400 or 700, `0.58rem` to `0.7rem`, `0.18em` to `0.25em` tracking, uppercase): spec sheet labels, status pills, table corner, stamps, legend, orbit labels.

### Named Rules
**The Uppercase Mono Rule.** Every heading and every label is Space Mono, uppercase, letter-spaced. Base tracking is `0.02em` on headings; labels widen to `0.15em` to `0.35em` as they shrink. Outfit is never uppercased except inside buttons.

**The Two Faces Rule.** Only Space Mono and Outfit exist. No third face, no system display font, and the display face is never swapped for a weight Outfit could carry.

**The Hero-Only Eyebrow Rule.** The starred eyebrow (`★ Text ★`, Space Mono, `text-xs`, `0.35em` tracking) belongs to page heroes and to the incumbent pages' section openers. On the wearables page it appears only on the hero; the lower sections open with the headline directly.

## Layout

The container centers at a 1400px max with 2rem side padding (Tailwind `container`). Pages are a vertical stack of full-width sections at `py-20` (5rem), alternating a plain cream section with a "band" section: `border-y-2 border-border bg-card` plus `bg-starburst`. Section openers are centered: headline, then a 0.75rem-spaced lede capped at `max-w-lg`; content starts `mt-12` (3rem) below. Card grids use `gap-5` or `gap-6`, two columns at `sm`, three to five at `md`/`lg`. The nav is a sticky 4rem bar with a 2px bottom border and backdrop blur; the mobile menu opens as a stacked list under it at `md` (768px).

Page heroes are full-bleed imagery with a top-to-bottom cream gradient (`from-background/60 via-background/40 to-background`), a scanline overlay, three counter-rotating atom rings, and centered content in `py-28` to `py-44`.

**The showroom stage** (wearables page) is the exception that proves the rhythm. `.showroom` is an inline-size container; the hero is a fixed `38.02cqw` tall stage (584 / 1536 of the approved comp) in which every plate, headline, spec row, and button is absolutely placed in container-width units, so the whole composition scales as one measured object from 900px up to any width. The worn strip below sits at `-0.15cqw` overlap and `4.56cqw` side margins; the configurator follows at `3.58cqw` margins. Below 900px (`@container showroom (max-width: 899px)`) the stage collapses to a stacked grid: content flows in `vw` units, the plate stage becomes an `84vw`-tall block, buttons go full width, and the worn strip becomes a two-column list. Lower sections leave the cqw system entirely and use the incumbent `container` rhythm with `rem` values.

Responsive thresholds observed: 768px (nav and two-column grids), 900px (showroom collapse, chassis and process grids, trim table stacking), 1000px (orbit hides and the stacked shape list shows), 1024px (`lg` five-column tiles).

### Named Rules
**The Band Alternation Rule.** No two adjacent sections share a ground. A plain cream section is followed by a card-cream band (2px top and bottom borders, starburst wash) or by a brown closing band.

**The Measured Stage Rule.** Anything composed against a raster plate is positioned in `cqw` inside an inline-size container, never in `px` or `vw`, and it must ship a sub-900px stacked layout that abandons absolute positioning.

## Elevation & Depth

Depth is printed, not lit. Cards and buttons cast a hard, unblurred offset shadow in retro brown, as if die-cut from a second sheet of paper. Hover moves the sheet 2 to 3px toward the top-left and lengthens the shadow. Ambient glow exists only around the device and its teal ring, and as the incumbent `retro-glow` and the text gradient's pulse. Blur is used once, on the sticky nav's backdrop.

### Shadow Vocabulary
- **Googie card** (`box-shadow: 5px 5px 0 hsl(var(--retro-brown) / 0.15)`): every card, plate, panel, trim sheet, worn strip, and configurator. Hover: `8px 8px 0 hsl(var(--teal) / 0.2)` with a teal border and `translate(-2px, -2px)`.
- **CTA lift** (`4px 4px 0 hsl(var(--retro-brown) / 0.3)`, hover `6px 6px 0`): the `cta` and `hero` buttons. The `retro` button uses `3px 3px 0`.
- **Heavy retro border** (`4px 4px 0 hsl(var(--retro-brown) / 0.4)` plus a 1px inset line, on a 3px brown border): testimonial-style framed blocks.
- **Device drop** (`drop-shadow(0 18px 24px hsl(var(--retro-brown) / 0.25))` to `0 24px 30px / 0.3`): the device render sitting on a card.
- **Teal glow** (`0 0 20px hsl(var(--teal) / 0.25), 0 0 50px hsl(var(--teal) / 0.1)`; nucleus `drop-shadow(0 0 28px hsl(var(--teal) / 0.45))`): the device's light, never a UI surface.
- **Halo ring** (`box-shadow: 0 0 0 4px` to `6px` in the ground color): electrons and step numbers cut a gap into the line they sit on.

### Named Rules
**The Die-Cut Rule.** Surfaces cast hard offset shadows with zero blur, in retro brown. A soft, blurred shadow under a card or button is off-world. Blur is reserved for light (teal glow) and for the nav backdrop.

**The Hover Lift Rule.** Interactive cards move `-2px, -2px` and swap the shadow to teal on hover; buttons move `-0.5` unit and lengthen their offset. Nothing scales on hover except the electron dot (1.45x).

## Shapes

Gently rounded rectangles on a 12px base (`--radius: 0.75rem`, `rounded-lg`), stepping down to 10px and 8px for small buttons and inputs, 4px for stamps, and 3px for label chips. Circles are the other primitive: atom rings, electron dots, step numbers, the device face. Borders are always 2px (cards, bands, nav edge, buttons' outline variant, input focus) or 3px (the heavy retro frame); rules inside cards are 1px dashed brown at 0.35 alpha. Diamonds (a 2px square rotated 45 degrees, teal) are the list bullet. The AVAILABLE NOW ribbon is the one cut shape: a `clip-path` polygon with a tapered tail, rotated 17.5 degrees on the plinth. Section bands are square-edged and full-bleed; everything inside them is rounded.

## Components

### Buttons
Tactile and confident: uppercase Outfit, wide tracking, and a hard shadow that answers the pointer.
- **Shape:** rounded (12px; 10px at `sm`), 40px tall by default, 48px at `lg`, `px-5` to `px-8`.
- **CTA (`cta`):** burnt orange on cream text with the 4px brown offset; hover lengthens to 6px and lifts. The primary action on every page and in the nav ("Get Started").
- **Hero (`hero`) / Hero Outline (`hero-outline`):** teal fill or teal 2px outline, Space Mono at `0.1em` tracking, `text-base`, `px-8 py-3`. Page-hero pairs and closing bands; on brown bands the outline is recolored to cream.
- **Outline (`outline`):** 2px retro-brown border on cream, deep-brown text, card-cream on hover. The secondary next to a `cta`.
- **Retro (`retro`):** brown fill, cream text, Space Mono `0.15em`, `text-xs`, 3px offset. Small utility actions.
- **Focus:** 2px teal ring with a 2px cream offset.
- **Showroom hero CTAs:** the stage's own pair, sized in cqw: an orange-to-orange vertical gradient pill with a 0.2cqw darker orange bottom edge, and a cream ghost with a 0.2cqw brown border. Below 900px the primary reverts to the incumbent hard offset shadow. These belong to the measured stage only; elsewhere use the `Button` variants.

### Eyebrow
- **Style:** `★ Text ★` in Space Mono, `text-xs`, `0.35em` tracking, uppercase, teal (or burnt orange with orange glow on the home hero). Precedes the H1 on page heroes and opens incumbent section blocks. Not used below the wearables hero.

### Cards / Containers (Googie card)
- **Corner Style:** 12px.
- **Background:** card cream.
- **Shadow Strategy:** the die-cut 5px brown offset; teal 8px on hover with a teal border and lift.
- **Border:** 2px border taupe.
- **Internal Padding:** `p-8` (2rem) for feature cards, `p-6` (1.5rem) for product tiles and testimonial frames.
- **Content order:** icon in a `bg-primary/10` 3rem square (product tiles) or bare teal icon, teal Space Mono title, muted Outfit body, optional teal "Learn more" label with an arrow that slides 4px on hover.

### Inputs / Fields
- **Style (configurator):** cream fill, teal 2px-equivalent border (`0.14cqw #229b9b`), 8px-equivalent radius, Space Mono bold uppercase at `0.1em`, teal caret, faint inset shadow, uppercase placeholder in a warm gray-brown.
- **Focus:** teal outline with offset; selection highlight teal at 0.35 alpha.
- **Behavior:** the typed value prints live onto the device label and the box lid; the input caps at 24 characters.

### Navigation
- **Style:** sticky, 4rem tall, card-cream at 80 to 95% with backdrop blur, 2px bottom border. Atom mark in teal that rotates 180 degrees over 700ms on hover; wordmark `NEATO_VENTURES` in Space Mono bold, `0.1em`, underscore in burnt orange.
- **Links:** Space Mono `text-xs` bold `0.15em` uppercase; muted brown, teal on hover and when active. A `cta` "Get Started" at `sm` sits last.
- **Mobile:** hamburger at `md`; links stack at `py-3` with the CTA full-width beneath.
- **Footer:** retro-brown band, 2px top border, four-column grid, cream text at 70% for links, teal starred slogan, 20%-alpha rule above the copyright line.

### Showroom Stage (signature)
The first viewport of the wearables page: a `38.02cqw`-tall hero composited from generated plates. Layers bottom-up: cityscape backdrop (`object-position: center 62%`), cream wash gradient (0.92 at the sky line to 0.22 at the base), chrome plinth plate, the device (a lazy-loaded react-three-fiber puck over a poster PNG that fades out in 600ms when the canvas is ready; reduced motion keeps the poster and stops the spin), the clipped orange AVAILABLE NOW ribbon, then the right-column copy: eyebrow, three-line headline, one-sentence lede, three spec rows (label, short dash, bold value), and the CTA pair. A scanline overlay sits over the whole stage. Copy is the approved comp's, verbatim, with COLLAR changed to LANYARD.

### Worn Strip (signature)
A single Googie-bordered strip overlapping the stage base by `0.15cqw`, three figures separated by two hairline dividers. Each figure is a product photograph of the real device worn (lapel, lanyard, wrist), generated from one prompt family so the device matches the hero, keyed to alpha, cropped tight at 3:2, vignetted with a radial mask, and captioned in Space Mono `0.22em` to the right of the art. Stacks into a two-column list below 900px. (Real hardware renders photographically; see Do's.)

### Name Configurator (signature)
A Googie-bordered panel: heading flanked by four-point spark glyphs, the input, a hint line, and a teal-gradient stage (`135deg, #74b3ae to #6faaa5`) carrying the device plate (cropped to its upper face on desktop, whole on mobile) and the box plate. The typed name renders in Device Ring Glow on the device and in dark teal, skewed `-7deg` and condensed `0.6`, on the box lid.

### Spec Sheet / Data Plate (signature)
A 5:7 grid at 900px. Left: a Googie plate with a scanline overlay, a teal micro-label title, a body paragraph, the device render with a tilted teal atom ring drawn behind it, and a rotated (`-2deg`) brown-outlined stamp. Right: a definition list with teal micro-label terms, deep-brown values, muted notes, and dashed brown rules between rows.

### Atom Model Line (signature)
A square orbit box (max 640px) with three elliptical rings (92% by 36%) rotated `-32`, `32`, and `90` degrees, each with a dashed mustard twin turning once every 40s. The shipped device is the nucleus with an orange "Shipping now" tag; other shapes are electrons: a 1rem dot (teal outline = concept, mustard fill = in development, dashed = your shape) with a haloed micro label, scaling 1.45x and turning orange on hover or selection. A tab-panel Googie card beside it swaps content with a 280ms fade-blur. Below 1000px the orbit is replaced by a stacked button list with status dots.

### Trim Sheet (signature)
A Googie-bordered table: cream header row with a 2px brown rule, tier names in Space Mono with an orange micro minimum beneath, teal micro-label row headers, dashed row rules, and hairline column separators drawn as pseudo-elements. Below 900px it becomes a per-row card list with a hidden header and a micro tier label per cell.

### Process Timeline (signature)
Five steps on a dashed teal line (`8px on, 6px off`), horizontal at 900px and vertical below. Step numbers are 2.75rem teal-outlined cream circles, zero-padded, with a 6px card-colored halo cutting the line. Titles are Space Mono `0.8rem`; descriptions cap at 16rem.

### Closing Band
Retro-brown, starburst wash, centered: floating orange atom mark, Space Mono H2 at `clamp(1.5rem, 1rem + 2vw, 2.4rem)`, orange semibold Outfit subhead with the orange glow, then a `cta` and a cream-recolored `hero-outline`.

### Reveal (motion wrapper)
The page's single entrance: `opacity 0 → 1`, `y 22px → 0` (30px for larger blocks), 600ms on `[0.16, 1, 0.3, 1]`, triggered once when the element is 8% into view, with optional stagger delays of 0.1 to 0.12s. Under `prefers-reduced-motion` it renders the children with no animation. This replaces per-element framer-motion scatter; incumbent pages use the equivalent `fadeUp` variant (30px, 0.6s ease-out, 0.12s stagger).

## Do's and Don'ts

### Do:
- **Do** set every heading, label, and button in Space Mono uppercase with tracking; body copy in Outfit at 1.6 line-height.
- **Do** frame surfaces as Googie cards: 2px border, `5px 5px 0` retro-brown shadow, 12px radius, teal lift on hover.
- **Do** alternate cream sections with card-cream starburst bands at `py-20`, and close pages on a retro-brown band with an orange tagline glow.
- **Do** reserve burnt orange for the primary action, the wordmark underscore, taglines, and "shipping now"; use teal for structure and focus.
- **Do** lay a scanline overlay over any raster imagery, and draw the atom rings as `2px` teal circles at 0.2 to 0.45 alpha.
- **Do** compose against generated plates in `cqw` inside an inline-size container, and ship the stacked layout below 900px.
- **Do** use `Reveal` (or the incumbent `fadeUp`) as the only entrance, honoring `prefers-reduced-motion`.
- **Do** refer to the shipped device as "the clip-on wearable" and keep the "★ ... ★" eyebrow to page heroes and incumbent section openers.
- **Do** render real hardware photographically (the clip-on as a live 3D object or a keyed product render, the smart badge as a studio product render) and draw concepts as brown-ink brochure illustrations, so a visitor can tell what exists from what is proposed without reading the status tag.

### Don't:
- **Don't** introduce gray: every neutral is a cream or a brown at some alpha.
- **Don't** put a soft, blurred drop shadow under a card or button; blur is for teal light and the nav backdrop only.
- **Don't** use a third typeface, a system display face, or Outfit for headings.
- **Don't** name the wearable's client, the client's product, or the client's software anywhere on the site.
- **Don't** add items to the four-item nav; product entry points live on the home grid, the products page, and the footer.
- **Don't** place starred eyebrows on the wearables page's lower sections, or use the showroom's literal hex inks outside the `.showroom` stage and worn strip.
- **Don't** build a feature list as an icon grid on a product page that has real hardware to show.
- **Don't** draw a real device as a sketch, or render a concept as a photograph; the medium is part of the status claim.
