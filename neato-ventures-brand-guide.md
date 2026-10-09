# Neato Ventures — Complete Brand & Theme Prompt

Paste this entire prompt into your other Lovable project to replicate the Neato Ventures brand identity.

---

## Brand Identity

- **Company:** Neato Ventures — an AI app and consulting firm based in Houston, TX
- **Slogan:** "Neato is building the future you were promised"
- **Tagline:** "Your Partner in Tomorrow"
- **Contact:** hello@neatoventures.com
- **Aesthetic:** 1950s/60s "Tomorrowland" retro-futuristic (Googie) — atomic age optimism, starburst patterns, CRT scanline overlays

---

## Typography

Import these Google Fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');
```

- **Display / Headers:** `Space Mono`, monospace — used for all headings, nav links, and retro accents. All headings should be `uppercase` with `letter-spacing: 0.02em`.
- **Body:** `Outfit`, sans-serif — used for paragraphs and general content.

Tailwind config:
```ts
fontFamily: {
  display: ["Space Mono", "monospace"],
  body: ["Outfit", "sans-serif"],
},
```

---

## Color Palette (HSL — "Modern Vintage")

### Light Mode (`:root`)
```css
:root {
  --background: 50 33% 95%;       /* warm cream */
  --foreground: 17 35% 12%;       /* deep brown */
  --card: 50 25% 92%;
  --card-foreground: 17 35% 12%;
  --popover: 50 33% 95%;
  --popover-foreground: 17 35% 12%;
  --primary: 179 52% 52%;         /* teal/aqua */
  --primary-foreground: 50 33% 95%;
  --secondary: 17 40% 36%;        /* retro brown */
  --secondary-foreground: 50 33% 95%;
  --muted: 45 20% 88%;
  --muted-foreground: 17 20% 40%;
  --accent: 45 87% 62%;           /* mustard yellow */
  --accent-foreground: 17 35% 12%;
  --destructive: 12 93% 58%;      /* burnt orange */
  --destructive-foreground: 50 33% 95%;
  --border: 17 15% 78%;
  --input: 17 15% 78%;
  --ring: 179 52% 52%;
  --radius: 0.75rem;

  /* Brand tokens */
  --teal: 179 52% 52%;
  --burnt-orange: 12 93% 58%;
  --mustard: 45 87% 62%;
  --retro-brown: 17 40% 36%;
  --cream: 50 33% 95%;

  --font-display: 'Space Mono', monospace;
  --font-body: 'Outfit', sans-serif;
}
```

### Dark Mode (`.dark`)
```css
.dark {
  --background: 17 30% 8%;
  --foreground: 50 33% 92%;
  --card: 17 25% 12%;
  --card-foreground: 50 33% 92%;
  --popover: 17 30% 8%;
  --popover-foreground: 50 33% 92%;
  --primary: 179 52% 55%;
  --primary-foreground: 17 30% 8%;
  --secondary: 17 40% 36%;
  --secondary-foreground: 50 33% 92%;
  --muted: 17 20% 18%;
  --muted-foreground: 50 15% 60%;
  --accent: 45 87% 62%;
  --accent-foreground: 17 30% 8%;
  --destructive: 12 93% 58%;
  --destructive-foreground: 50 33% 92%;
  --border: 17 15% 22%;
  --input: 17 15% 22%;
  --ring: 179 52% 55%;
}
```

### Tailwind brand colors:
```ts
colors: {
  teal: "hsl(var(--teal))",
  "burnt-orange": "hsl(var(--burnt-orange))",
  mustard: "hsl(var(--mustard))",
  "retro-brown": "hsl(var(--retro-brown))",
  cream: "hsl(var(--cream))",
}
```

---

## Visual Elements & CSS Components

### Retro text gradient (for hero wordmarks):
```css
.text-gradient-retro {
  background: linear-gradient(135deg, hsl(var(--teal)) 0%, hsl(var(--mustard)) 50%, hsl(var(--burnt-orange)) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: neato-glow 3s ease-in-out infinite;
}

@keyframes neato-glow {
  0%, 100% { filter: brightness(1) drop-shadow(0 0 8px hsl(var(--teal) / 0.3)); }
  50% { filter: brightness(1.25) drop-shadow(0 0 25px hsl(var(--teal) / 0.6)) drop-shadow(0 0 50px hsl(var(--mustard) / 0.3)); }
}
```

### CRT Scanline overlay:
```css
.scanlines::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground) / 0.03) 2px, hsl(var(--foreground) / 0.03) 4px);
  pointer-events: none;
  z-index: 1;
}
```

### Atomic starburst background:
```css
.bg-starburst {
  background-image:
    radial-gradient(circle at 50% 50%, hsl(var(--mustard) / 0.15) 0%, transparent 40%),
    radial-gradient(circle at 20% 30%, hsl(var(--teal) / 0.1) 0%, transparent 35%),
    radial-gradient(circle at 80% 70%, hsl(var(--burnt-orange) / 0.08) 0%, transparent 35%);
}
```

### Googie-style card:
```css
.googie-card {
  border: 2px solid hsl(var(--border));
  background: hsl(var(--card));
  box-shadow: 5px 5px 0 hsl(var(--retro-brown) / 0.15);
  transition: all 0.3s ease;
}
.googie-card:hover {
  box-shadow: 8px 8px 0 hsl(var(--teal) / 0.2);
  border-color: hsl(var(--teal));
  transform: translate(-2px, -2px);
}
```

### Retro border with heavy offset shadow:
```css
.retro-border {
  border: 3px solid hsl(var(--retro-brown));
  box-shadow: 4px 4px 0 hsl(var(--retro-brown) / 0.4), inset 0 0 0 1px hsl(var(--retro-brown) / 0.1);
}
```

### Retro glow:
```css
.retro-glow {
  box-shadow: 0 0 20px hsl(var(--teal) / 0.25), 0 0 50px hsl(var(--teal) / 0.1);
}
```

---

## Animations

```css
@keyframes orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes fade-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes pulse-glow { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
@keyframes glitch { 0%, 90%, 100% { transform: translate(0); } 92% { transform: translate(-2px, 1px); } 94% { transform: translate(2px, -1px); } 96% { transform: translate(-1px, -1px); } 98% { transform: translate(1px, 1px); } }
```

Use these as: `animate-orbit`, `animate-fade-up`, `animate-float`, `animate-pulse-glow`, `glitch-text`

---

## Logo & Navbar Pattern

- Use the Lucide `Atom` icon (`lucide-react`) as the primary brand mark, colored `text-primary` with a hover rotation (`group-hover:rotate-180 duration-700`).
- Brand text: `Neato` + `_` (burnt-orange colored) + `Ventures` in Space Mono, uppercase, `tracking-[0.1em]`, bold.
- Nav links: Space Mono, `text-xs uppercase tracking-[0.15em] font-bold`, with active state colored `text-primary`.

---

## Hero Section Pattern

Every hero section should follow this structure:
1. **Full-bleed background image** with `object-cover`
2. **Gradient overlay:** `bg-gradient-to-b from-background/60 via-background/40 to-background`
3. **Scanline overlay** (the `.scanlines` class)
4. **Decorative atom rings** — CSS circles with `border: 2px solid hsl(var(--teal) / 0.2)`, `border-radius: 50%`, animated with `animate-orbit` at varying speeds and directions
5. **Content** positioned with `relative z-10`
6. **Hero wordmark** uses `.text-gradient-retro` for the large brand name
7. **Taglines** in `text-burnt-orange font-semibold` with drop shadows

---

## Hero Image Descriptions (for AI generation)

If you need to generate matching hero images, use these prompts:

- **Homepage:** "A retro-futuristic 1950s Googie-style cityscape at dusk with atomic-age architecture, chrome spires, starburst signs, and a teal-orange sunset sky. Ultra high resolution, 16:9 aspect ratio."
- **About:** "Two silhouetted figures looking toward a gleaming atomic-age city of tomorrow with chrome domes and starburst towers, warm sunset palette of teal, orange, and cream. Ultra high resolution, 16:9."
- **AI Receptionist:** "A retro-futuristic 1950s robot receptionist at a sleek chrome desk in a Googie-style office lobby, warm teal and orange lighting. Ultra high resolution, 16:9."
- **AI Prompt Architect:** "A retro-futuristic 1950s control room with glowing screens, dials, and a scientist at a console, Googie architecture, teal and mustard color palette. Ultra high resolution, 16:9."
- **Neato Type:** "A retro-futuristic 1950s microphone and typewriter hybrid machine with atomic-age chrome design, starburst decorations, warm cream and teal lighting. Ultra high resolution, 16:9."
- **Consulting:** "A retro-futuristic 1950s boardroom with panoramic windows showing a Googie cityscape, chrome furniture, atomic-age decor, teal and burnt-orange accents. Ultra high resolution, 16:9."

---

## Component Patterns

- Use `framer-motion` for all page animations (fade-up on scroll, staggered reveals)
- Use `shadcn/ui` components styled with the design tokens above
- Burnt orange is the **primary accent** for taglines, icons, and brand highlights
- Diamond list bullets: use `before:content-[''] before:w-2 before:h-2 before:bg-primary before:rotate-45` for decorative list items
- All buttons should have custom variants: `hero` (gradient bg), `hero-outline` (transparent with border), and `cta` (solid primary)
