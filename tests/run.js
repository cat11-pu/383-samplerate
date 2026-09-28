import assert from "node:assert";
import { bumpOf, showOf } from "../rate.js";
import { step, close } from "../raterun.js";
import { render } from "../app.js";

const base = {
  budget: 2, every: 3,
  state: { pending: 0, kept: [], dropped: 0, shown: [], ledger: [], applied: [] },
  events: [
    { id: 1, kind: "put", value: 10 },
    { id: 2, kind: "put", value: 20 },
    { id: 3, kind: "put", value: 30 },
    { id: 4, kind: "show" },
    { id: 5, kind: "put", value: 40 }
  ],
  bad_value_code: "E_BAD_VALUE", empty_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpOf counts to the interval then resets", () => {
  assert.deepStrictEqual(bumpOf(0, 3), { pending: 1, sampled: false });
  assert.deepStrictEqual(bumpOf(1, 3), { pending: 2, sampled: false });
  assert.deepStrictEqual(bumpOf(2, 3), { pending: 0, sampled: true });
  assert.strictEqual(showOf([]), -1);
  assert.strictEqual(showOf([[3, 30]]), 1);
});

check("step spends the budget and defers the rest to the ledger", () => {
  const r = step(base);
  assert.strictEqual(r.served, 2);
  assert.strictEqual(r.ledger_before, 3);
  assert.deepStrictEqual(r.ledger, [
    ["put", 30, null], ["show", null, null], ["put", 40, null]
  ]);
  assert.strictEqual(r.state.dropped, 2);
  assert.deepStrictEqual(r.state.applied, [1, 2, 3, 4, 5]);
  assert.ok(r.judged <= r.judged_bound);
});

check("close drains the ledger and sampling lands on every Nth put", () => {
  const first = step(base);
  const done = close(Object.assign({}, base, { state: first.state }));
  assert.strictEqual(done.catchup, 3);
  assert.deepStrictEqual(done.state.kept, [[3, 30]]);
  assert.strictEqual(done.state.dropped, 3);
  assert.deepStrictEqual(done.state.shown, [1]);
  assert.strictEqual(done.state.ledger.length, 0);
});

check("replay does nothing and split runs close to the same state", () => {
  const first = step(base);
  const done = close(Object.assign({}, base, { state: first.state }));
  assert.strictEqual(step(Object.assign({}, base, { state: done.state })).served, 0);
  const half = Math.ceil(base.events.length / 2);
  const r1 = step(Object.assign({}, base, { events: base.events.slice(0, half) }));
  const r2 = step(Object.assign({}, base, { state: r1.state, events: base.events.slice(half) }));
  const doneTwo = close(Object.assign({}, base, { state: r2.state }));
  assert.deepStrictEqual(doneTwo.state, done.state);
});

check("bad event, bad value and empty show report their codes", () => {
  const tryCode = function (event) {
    try { step(Object.assign({}, base, { events: [event] })); return null; }
    catch (error) { return error.code; }
  };
  assert.strictEqual(tryCode({ id: 1, kind: "peek", value: 1 }), "E_BAD_EVENT");
  assert.strictEqual(tryCode({ id: 1, kind: "put", value: 2.5 }), "E_BAD_VALUE");
  assert.strictEqual(tryCode({ id: 1, kind: "show" }), "E_EMPTY");
  const view = render(base);
  assert.strictEqual(Object.keys(view).length, 18);
  assert.strictEqual(view.full_diff, 0);
  assert.strictEqual(view.pair_differs, true);
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
