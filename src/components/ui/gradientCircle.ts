// Brand teal gradient for the primary circular actions (mic / send), matching
// Neato's teal signal (device-ring-glow → showroom-teal-ink → deep teal). Was a
// stray blue from an old Figma asset, off the teal/burnt-orange brand palette.
// transform-gpu keeps each circle on its own compositing layer from first paint —
// without it, Chromium can flash a black first frame when one mounts over backdrop-blur.
export const GRADIENT_CIRCLE =
  "bg-[linear-gradient(221deg,#5ECEBC_0%,#3EABAB_55%,#246E6E_100%)] text-white transform-gpu";
