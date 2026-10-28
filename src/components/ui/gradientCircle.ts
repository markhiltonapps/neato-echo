// Brand teal gradient for the primary circular actions (mic / send), matching
// Neato's teal signal (device-ring-glow → showroom-teal-ink → deep teal). Was a
// stray blue from an old Figma asset, off the teal/burnt-orange brand palette.
// transform-gpu keeps each circle on its own compositing layer from first paint —
// without it, Chromium can flash a black first frame when one mounts over backdrop-blur.
export const GRADIENT_CIRCLE =
  "bg-[linear-gradient(221deg,#5ECEBC_0%,#3EABAB_55%,#246E6E_100%)] text-white transform-gpu";

// Burnt-orange variant for the record / voice-capture circles. Recording is the
// product's signature action, so it carries the warm brand signal (matching the
// "New recording" buttons) rather than the teal used for neutral chrome.
export const WARM_GRADIENT_CIRCLE =
  "bg-[linear-gradient(221deg,#FB8560_0%,#F0562E_55%,#C23E1C_100%)] text-white transform-gpu";
