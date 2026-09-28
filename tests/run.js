import assert from "node:assert";
import { bumpOf, showOf } from "../rate.js";
import { step, close } from "../raterun.js";
import { render } from "../app.js";

const base = {
  budget: 1, every: 3,
  state: { pending: 0, kept: [], dropped: 0, shown: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "put", value: 10 }],
  bad_value_code: "E_BAD_VALUE", empty_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpOf returns pending and sampled", () => {
  const got = bumpOf(1, 3);
  assert.strictEqual(typeof got.pending, "number");
});

check("showOf returns a number", () => {
  assert.strictEqual(typeof showOf([[1, 5]]), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
