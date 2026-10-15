// Date-range filtering for the notes list, shared so mobile and desktop agree on
// what "Today / This week / This month" mean. Pure and unit-tested.

export type DateRange = "all" | "today" | "week" | "month";

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

// Start of the local day for `now` (midnight). Kept explicit so tests can pin it.
function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// Inclusive lower bound (epoch ms) for a range, or null for "all".
// today  = since local midnight
// week   = last 7 days
// month  = last 30 days
export function rangeStartMs(range: DateRange, nowMs: number): number | null {
  const now = new Date(nowMs);
  switch (range) {
    case "today":
      return startOfLocalDay(now);
    case "week":
      return nowMs - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return nowMs - 30 * 24 * 60 * 60 * 1000;
    case "all":
    default:
      return null;
  }
}

export function isInRange(dateMs: number, range: DateRange, nowMs: number): boolean {
  const start = rangeStartMs(range, nowMs);
  return start == null ? true : dateMs >= start;
}

// Human bucket for grouping a date within a list: Today / This week / This month /
// Earlier. Boundaries match rangeStartMs so filters and groups agree.
export function dateBucket(dateMs: number, nowMs: number): "Today" | "This week" | "This month" | "Earlier" {
  if (dateMs >= (rangeStartMs("today", nowMs) as number)) return "Today";
  if (dateMs >= (rangeStartMs("week", nowMs) as number)) return "This week";
  if (dateMs >= (rangeStartMs("month", nowMs) as number)) return "This month";
  return "Earlier";
}
