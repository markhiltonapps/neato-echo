// Calendar rows store an unambiguous instant — Google keeps the event's local
// offset (2026-09-08T08:30:00-05:00), Microsoft normalizes to UTC (…Z) — but
// LLMs are unreliable at converting those to "local time" and routinely botch
// DST (showing an 8:30 CDT meeting as 7:30 by applying the -06:00 standard
// offset). So we pre-format each time in the user's real zone here, where
// Intl handles DST correctly, and instruct the model to echo the string
// verbatim instead of recomputing it.

interface FormatOptions {
  /** Override the zone/locale in tests; defaults to the runtime's own. */
  timeZone?: string;
  locale?: string;
}

/**
 * A timed event → "Mon, Sep 8, 8:30 AM CDT". An all-day event → "Mon, Sep 8"
 * (formatted from the date parts, with NO zone conversion — parsing a bare
 * YYYY-MM-DD as UTC midnight and localizing it can slip to the previous day).
 * Unparseable input falls back to the raw string so we never show nothing.
 */
export function formatEventTimeLocal(
  raw: string | null | undefined,
  isAllDay: boolean,
  opts: FormatOptions = {}
): string {
  if (!raw) return "";
  const { timeZone, locale } = opts;

  if (isAllDay) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return raw;
    const [, y, mo, d] = m;
    const local = new Date(Number(y), Number(mo) - 1, Number(d));
    if (Number.isNaN(local.getTime())) return raw;
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(local);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
