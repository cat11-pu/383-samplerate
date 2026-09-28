import assert from "node:assert";
import { bumpOf, showOf } from "../rate.js";
import { step, close } from "../raterun.js";
import { render } from "../app.js";

const CODES = {
  bad_value_code: "E_BAD_VALUE", empty_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};
const fresh = function () {
  return { pending: 0, kept: [], dropped: 0, shown: [], ledger: [], applied: [] };
};
const ev = function (id, kind, value) {
  const item = { id: id, kind: kind };
  if (typeof value !== "undefined") item.value = value;
  return item;
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bumpOf counts every and showOf reads kept", () => {
  assert.deepStrictEqual(bumpOf(0, 3), { pending: 1, sampled: false });
  assert.deepStrictEqual(bumpOf(2, 3), { pending: 0, sampled: true });
  assert.strictEqual(showOf([]), -1);
  assert.strictEqual(showOf([[3, 30]]), 1);
});

check("step samples at interval, drops otherwise, show needs a sample", () => {
  const spec = Object.assign({ budget: 2, every: 3, state: fresh(),
    events: [ev(1, "put", 10), ev(2, "put", 20)] }, CODES);
  const got = step(spec);
  assert.strictEqual(got.served, 2);
  assert.strictEqual(got.state.pending, 2);
  assert.deepStrictEqual(got.state.kept, []);
  assert.strictEqual(got.state.dropped, 2);
  assert.throws(function () {
    step(Object.assign({ budget: 1, every: 3, state: fresh(), events: [ev(1, "show")] }, CODES));
  }, function (error) { return error.code === "E_EMPTY"; });
});

check("step leaves a ledger when budget runs out and close drains it", () => {
  const spec = Object.assign({ budget: 2, every: 3, state: fresh(), events: [
    ev(1, "put", 10), ev(2, "put", 20), ev(3, "put", 30),
    ev(4, "show"), ev(5, "put", 40)] }, CODES);
  const got = step(spec);
  assert.strictEqual(got.served, 2);
  assert.strictEqual(got.ledger_before, 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(got.ledger)),
    [["put", 30, null], ["show", null, null], ["put", 40, null]]);
  const done = close(Object.assign({}, spec, { state: got.state }));
  assert.strictEqual(done.catchup, 3);
  assert.deepStrictEqual(done.state.kept, [[3, 30]]);
  assert.strictEqual(done.state.dropped, 3);
  assert.deepStrictEqual(done.state.shown, [1]);
  assert.strictEqual(done.state.ledger.length, 0);
  assert.strictEqual(step(Object.assign({}, spec, { state: done.state })).served, 0);
  assert.deepStrictEqual(spec.state, fresh());
});

check("bad values and bad events report their codes (value checked first)", () => {
  assert.throws(function () {
    step(Object.assign({ budget: 1, every: 3, state: fresh(),
      events: [ev(1, "put", 2.5)] }, CODES));
  }, function (error) { return error.code === "E_BAD_VALUE"; });
  assert.throws(function () {
    step(Object.assign({ budget: 1, every: 3, state: fresh(),
      events: [ev(1, "peek", 1)] }, CODES));
  }, function (error) { return error.code === "E_BAD_EVENT"; });
});

check("render keeps the eighteen-key contract with kept/dropped/shown first", () => {
  const spec = Object.assign({ budget: 2, every: 3, state: fresh(), events: [
    ev(1, "put", 10), ev(2, "put", 20), ev(3, "put", 30),
    ev(4, "show"), ev(5, "put", 40)] }, CODES);
  const view = render(spec);
  assert.deepStrictEqual(Object.keys(view),
    ["kept", "dropped", "shown", "served_first", "served_wide", "pair_differs",
     "ledger_before", "ledger", "catchup", "ledger_after", "mid_differs",
     "closed_equal", "replay_new", "judged", "judged_bound", "full_diff",
     "count_events", "tail"]);
  assert.deepStrictEqual(view.kept, [[3, 30]]);
  assert.strictEqual(view.dropped, 3);
  assert.deepStrictEqual(view.shown, [1]);
  assert.strictEqual(view.served_first, 2);
  assert.strictEqual(view.served_wide, 4);
  assert.strictEqual(view.pair_differs, true);
  assert.strictEqual(view.ledger_before, 3);
  assert.strictEqual(view.catchup, 3);
  assert.strictEqual(view.ledger_after, 0);
  assert.strictEqual(view.mid_differs, true);
  assert.strictEqual(view.closed_equal, true);
  assert.strictEqual(view.replay_new, 0);
  assert.ok(view.judged <= view.judged_bound);
  assert.strictEqual(view.full_diff, 0);
  assert.strictEqual(view.count_events, 5);
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
