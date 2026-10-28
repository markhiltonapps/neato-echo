// Neddy design tokens — the single source of truth for palette + type, shared by
// desktop (mapped to CSS vars) and mobile (mapped to RN styles). Values mirror the
// desktop app's index.css :root.

export const colors = {
  bg: "#f4efe1", // canvas / surface-2
  surface0: "#fdfbf3", // input / popover
  surface1: "#fbf8ef", // card
  surface3: "#ece4d1", // muted / secondary
  raised: "#e3d9c1",
  text: "#3a322b", // foreground
  sub: "#6d6255", // muted-foreground
  teal: "#3d726c", // primary
  tealBright: "#5e9491", // brand-teal / ring
  tealDim: "#37605c",
  amber: "#cf8a34", // brand-warm
  amber2: "#e8b25a", // brand-warm-2
  onAmber: "#2a2013",
  border: "#e3d9c1",
  destructive: "#c2554a",
  success: "#3f8f6e",
} as const;

export const radii = { sm: 4, md: 6, lg: 8, xl: 10, card: 18, pill: 999 } as const;

// Base family; each platform maps weights to its own font handles
// (mobile: Outfit_600SemiBold, web: font-weight: 600).
export const typography = {
  family: "Outfit",
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

export type Colors = typeof colors;
