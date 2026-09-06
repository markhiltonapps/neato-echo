# Neato Ventures brand handoff (for Neato Echo)

Copied from the neatoventures.com repo (`markhiltonapps/neatoventures`, commit ea656b1) on 2026-09-05 so this app can match the company site.

## What is here
- `DESIGN.md` — the recorded design system for neatoventures.com: tokens, type (Space Mono display, Outfit body), the Googie card, starburst bands, scanlines, atom rings, button variants, and the do's and don'ts. Impeccable reads this as the binding visual world.
- `.impeccable/design.json` — machine-readable sidecar the Impeccable design detector uses to flag off-brand values.
- `neato-ventures-brand-guide.md` — the short human-readable brand prompt with the exact CSS tokens and Tailwind config.
- `brand/neato-ventures/` — logo PNGs, favicon, and the site's `index.css` and `tailwind.config.ts` for the literal token values.

## How to use it in Impeccable
1. Run `/impeccable init` here first so Neato Echo gets its own PRODUCT.md. Do not copy the website's product truth.
2. Keep `DESIGN.md` as the visual authority. When asking for work, pin it in words: "Match the Neato Ventures system recorded in DESIGN.md."
3. Inherit the site-wide system: palette, type, cards, bands, motion grammar, copy voice.
4. Ignore the wearables **showroom stage** parts of DESIGN.md (the `.showroom` container, cqw-measured hero, literal showroom inks, worn strip, configurator, trim sheet). Those belong to one marketing page.
5. Neato Echo is a desktop tool, so it is an **Operate** surface: scanability and native Windows expectations outrank expression. Brand lives in precise details (type, color roles, card treatment), not in hero theatrics.
