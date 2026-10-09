const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/tools/formatEventTime.ts");

// The locale renders a narrow no-break space before AM/PM, so assertions check
// the hour digits (the actual bug signal) rather than the full "8:30 AM".

test("Google-style offset time renders in the pinned zone with DST (CDT, not CST)", async () => {
  const { formatEventTimeLocal } = await load();
  // 08:30 at -05:00 == 13:30 UTC. In America/Chicago in September that is CDT
  // (08:30), NOT CST (07:30) — the exact bug the user hit.
  const out = formatEventTimeLocal("2026-09-08T08:30:00-05:00", false, {
    timeZone: "America/Chicago",
    locale: "en-US",
  });
  assert.match(out, /8:30/);
  assert.doesNotMatch(out, /7:30/);
});

test("Microsoft-style UTC (Z) time converts to the pinned local zone", async () => {
  const { formatEventTimeLocal } = await load();
  // 13:30 UTC -> 08:30 CDT in Chicago.
  const out = formatEventTimeLocal("2026-09-08T13:30:00Z", false, {
    timeZone: "America/Chicago",
    locale: "en-US",
  });
  assert.match(out, /8:30/);
});

test("winter date uses CST, proving DST is respected per-date", async () => {
  const { formatEventTimeLocal } = await load();
  // 14:30 UTC in January -> 08:30 CST in Chicago.
  const out = formatEventTimeLocal("2026-01-08T14:30:00Z", false, {
    timeZone: "America/Chicago",
    locale: "en-US",
  });
  assert.match(out, /8:30/);
});

test("all-day event formats from date parts without zone shifting the day", async () => {
  const { formatEventTimeLocal } = await load();
  const out = formatEventTimeLocal("2026-09-08", true, {
    timeZone: "America/Chicago",
    locale: "en-US",
  });
  assert.match(out, /Sep 8/);
  assert.doesNotMatch(out, /Sep 7/);
});

test("blank input returns empty; unparseable returns raw", async () => {
  const { formatEventTimeLocal } = await load();
  assert.equal(formatEventTimeLocal("", false), "");
  assert.equal(formatEventTimeLocal(null, false), "");
  assert.equal(formatEventTimeLocal("not-a-date", false), "not-a-date");
});
