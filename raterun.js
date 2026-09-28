// raterun.js：按处理预算处理并留账，收尾把账做完
import { bumpOf, showOf } from "./rate.js";

function codeOf(spec, field, fallback) {
  return (spec && spec[field]) || fallback;
}

function failure(spec, field, fallback, message) {
  const error = new Error(message);
  error.code = codeOf(spec, field, fallback);
  return error;
}

function cloneState(state) {
  const src = state || {};
  return {
    pending: src.pending || 0,
    kept: (src.kept || []).map(function (row) { return [row[0], row[1]]; }),
    dropped: src.dropped || 0,
    shown: (src.shown || []).slice(),
    ledger: (src.ledger || []).map(function (row) { return [row[0], row[1], null]; }),
    applied: (src.applied || []).slice()
  };
}

function ledgerRow(event) {
  return [event.kind, event.kind === "put" ? event.value : null, null];
}

function applyOne(state, kind, value, ordinal, spec) {
  if (kind === "put") {
    const bumped = bumpOf(state.pending, spec.every);
    if (bumped.sampled) state.kept.push([ordinal, value]);
    else state.dropped += 1;
    state.pending = bumped.pending;
    return;
  }
  if (showOf(state.kept) < 0) {
    throw failure(spec, "empty_code", "E_EMPTY", "采样清单为空，不能展示");
  }
  state.shown.push(showOf(state.kept));
}

function drainLedger(state, capacity, spec) {
  let served = 0;
  const ordinals = state.applied.slice(-state.ledger.length);
  let index = 0;
  while (capacity > 0 && state.ledger.length > 0) {
    const row = state.ledger.shift();
    applyOne(state, row[0], row[1], ordinals[index], spec);
    index += 1;
    capacity -= 1;
    served += 1;
  }
  return served;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let capacity = spec.budget;
  const ledgerEntering = state.ledger.length;

  let served = drainLedger(state, capacity, spec);
  capacity -= served;

  for (const event of events) {
    if (state.applied.indexOf(event && event.id) !== -1) continue;

    const badKind = !event || typeof event !== "object"
      || (event.kind !== "put" && event.kind !== "show");
    if (badKind) {
      throw failure(spec, "event_error_code", "E_BAD_EVENT", "事件结构不合法");
    }
    if (event.kind === "put" && !Number.isInteger(event.value)) {
      throw failure(spec, "bad_value_code", "E_BAD_VALUE", "进值必须是整数");
    }

    const ordinal = event.id != null ? event.id : state.applied.length + 1;
    if (capacity > 0) {
      applyOne(state, event.kind, event.kind === "put" ? event.value : null, ordinal, spec);
      capacity -= 1;
      served += 1;
    } else {
      state.ledger.push(ledgerRow(event));
    }
    state.applied.push(event.id);
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return [row[0], row[1], null]; }),
    judged: served,
    judged_bound: ledgerEntering + events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = drainLedger(state, Infinity, spec);
  return { state: state, catchup: catchup };
}
