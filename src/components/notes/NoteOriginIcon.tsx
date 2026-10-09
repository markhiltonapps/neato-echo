import { Smartphone, Monitor, SquarePlay } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

// Small icon showing where a recording/note was captured. A note with no explicit
// origin was created locally on the desktop, so null/unknown falls back to "desktop".
export function NoteOriginIcon({
  origin,
  size = 12,
  className = "",
}: {
  origin?: string | null;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const kind = origin === "mobile" ? "mobile" : origin === "youtube" ? "youtube" : "desktop";
  const Icon = kind === "mobile" ? Smartphone : kind === "youtube" ? SquarePlay : Monitor;
  const label = t(`notes.origin.${kind}`);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 text-foreground/35 dark:text-foreground/30", className)}
    >
      <Icon size={size} />
    </span>
  );
}
