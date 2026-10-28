import neddy from "@/assets/neddy.webp";

interface ChatEmptyIllustrationProps {
  /** Rendered height in px. Neddy is portrait (461x520). */
  size?: number;
}

export function ChatEmptyIllustration({ size = 128 }: ChatEmptyIllustrationProps) {
  const h = size;
  const w = Math.round((461 / 520) * h);

  return (
    <img
      src={neddy}
      alt=""
      aria-hidden="true"
      width={w}
      height={h}
      draggable={false}
      decoding="async"
      className="select-none drop-shadow-[0_12px_28px_rgba(58,40,20,0.20)]"
      style={{ width: w, height: h }}
    />
  );
}
