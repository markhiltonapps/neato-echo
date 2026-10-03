const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/ai/localThinkingBody.ts");

test("injects enable_thinking:false and think:false, preserving the request", async () => {
  const { injectLocalThinkingDisabled } = await load();
  const original = { model: "qwen", messages: [{ role: "user", content: "hi" }], tools: [{ x: 1 }] };
  const out = JSON.parse(injectLocalThinkingDisabled(JSON.stringify(original)));
  assert.equal(out.think, false);
  assert.deepEqual(out.chat_template_kwargs, { enable_thinking: false });
  // Everything else survives untouched.
  assert.equal(out.model, "qwen");
  assert.deepEqual(out.messages, original.messages);
  assert.deepEqual(out.tools, original.tools);
});

test("merges into an existing chat_template_kwargs object", async () => {
  const { injectLocalThinkingDisabled } = await load();
  const out = JSON.parse(
    injectLocalThinkingDisabled(JSON.stringify({ chat_template_kwargs: { foo: "bar" } }))
  );
  assert.deepEqual(out.chat_template_kwargs, { foo: "bar", enable_thinking: false });
});

test("non-JSON body is returned unchanged", async () => {
  const { injectLocalThinkingDisabled } = await load();
  assert.equal(injectLocalThinkingDisabled("not json"), "not json");
});
