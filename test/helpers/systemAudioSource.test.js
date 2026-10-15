const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/systemAudioSource.js");

// Build a getter over a plain object map.
const getter = (map) => (key) => (key in map ? map[key] : null);

test("empty/unset resolves to auto", async () => {
  const { resolveSystemAudioSource, systemAudioSourceForcesRenderer } = await load();
  const r = resolveSystemAudioSource(getter({}));
  assert.deepEqual(r, { mode: "auto", deviceId: null });
  assert.equal(systemAudioSourceForcesRenderer(r), false);
});

test("unknown mode resolves to auto", async () => {
  const { resolveSystemAudioSource } = await load();
  assert.deepEqual(resolveSystemAudioSource(getter({ systemAudioSourceMode: "bogus" })), {
    mode: "auto",
    deviceId: null,
  });
});

test("screen mode forces renderer", async () => {
  const { resolveSystemAudioSource, systemAudioSourceForcesRenderer } = await load();
  const r = resolveSystemAudioSource(getter({ systemAudioSourceMode: "screen" }));
  assert.deepEqual(r, { mode: "screen", deviceId: null });
  assert.equal(systemAudioSourceForcesRenderer(r), true);
});

test("device mode with an id forces renderer and carries the id", async () => {
  const { resolveSystemAudioSource, systemAudioSourceForcesRenderer } = await load();
  const r = resolveSystemAudioSource(
    getter({ systemAudioSourceMode: "device", systemAudioSourceId: "abc123" })
  );
  assert.deepEqual(r, { mode: "device", deviceId: "abc123" });
  assert.equal(systemAudioSourceForcesRenderer(r), true);
});

test("device mode with no id falls back to auto (nothing to capture)", async () => {
  const { resolveSystemAudioSource, systemAudioSourceForcesRenderer } = await load();
  const r = resolveSystemAudioSource(getter({ systemAudioSourceMode: "device" }));
  assert.deepEqual(r, { mode: "auto", deviceId: null });
  assert.equal(systemAudioSourceForcesRenderer(r), false);
});
