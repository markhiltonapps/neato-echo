const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/neatoCloudConnection.js");

test("a live session is connected", async () => {
  const { decideNeatoConnection } = await load();
  assert.equal(
    decideNeatoConnection({ event: "SIGNED_IN", hasSession: true, hadSession: false, userSignedOut: false }),
    "connected"
  );
  assert.equal(
    decideNeatoConnection({ event: "TOKEN_REFRESHED", hasSession: true, hadSession: true, userSignedOut: false }),
    "connected"
  );
});

test("a lapse (signed out after having a session, not user-initiated) is disconnected", async () => {
  const { decideNeatoConnection } = await load();
  assert.equal(
    decideNeatoConnection({ event: "SIGNED_OUT", hasSession: false, hadSession: true, userSignedOut: false }),
    "disconnected"
  );
});

test("a deliberate sign-out is NOT flagged as a lapse", async () => {
  const { decideNeatoConnection } = await load();
  assert.equal(
    decideNeatoConnection({ event: "SIGNED_OUT", hasSession: false, hadSession: true, userSignedOut: true }),
    "unknown"
  );
});

test("never having had a session shows nothing (unknown), not a lapse", async () => {
  const { decideNeatoConnection } = await load();
  assert.equal(
    decideNeatoConnection({ event: "INITIAL_SESSION", hasSession: false, hadSession: false, userSignedOut: false }),
    "unknown"
  );
  assert.equal(
    decideNeatoConnection({ event: "SIGNED_OUT", hasSession: false, hadSession: false, userSignedOut: false }),
    "unknown"
  );
});

test("defensive: no args returns unknown", async () => {
  const { decideNeatoConnection } = await load();
  assert.equal(decideNeatoConnection(), "unknown");
});
