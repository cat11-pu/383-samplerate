// raterun.js：按处理预算处理并留账，收尾把账做完
import { bumpOf, showOf } from "./rate.js";

function code(spec, key, fallback) {
  const value = spec && spec[key];
  return typeof value === "string" && value ? value : fallback;
}

function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function makeError(codeValue, message) {
  const error = new Error(message);
  error.code = codeValue;
  return error;
}

function makeRow(kind, value, eid) {
  const row = [kind, value, null];
  row.eid = eid;
  return row;
}

function cloneRow(row) {
  return makeRow(row[0], row[1], row.eid);
}

function cloneState(state) {
  const source = state || {};
  return {
    pending: Number(source.pending) || 0,
    kept: (source.kept || []).map(function (row) { return [row[0], row[1]]; }),
    dropped: source.dropped || 0,
    shown: (source.shown || []).slice(),
    ledger: (source.ledger || []).map(cloneRow),
    applied: (source.applied || []).slice()
  };
}

function toRow(event, index, spec) {
  if (!event || typeof event !== "object"
      || (event.kind !== "put" && event.kind !== "show")) {
    throw makeError(code(spec, "event_error_code", "E_BAD_EVENT"), "非法事件");
  }
  if (event.kind === "put" && !isInt(event.value)) {
    throw makeError(code(spec, "bad_value_code", "E_BAD_VALUE"), "值不是整数");
  }
  const eid = typeof event.id === "undefined" ? index : event.id;
  return event.kind === "put" ? makeRow("put", event.value, eid)
    : makeRow("show", null, eid);
}

function applyRow(state, row, spec) {
  if (row[0] === "put") {
    const bump = bumpOf(state.pending, spec.every);
    state.pending = bump.pending;
    if (bump.sampled) state.kept.push([row.eid, row[1]]);
    else state.dropped += 1;
  } else {
    if (!state.kept.length) {
      throw makeError(code(spec, "empty_code", "E_EMPTY"), "还没有采样");
    }
    state.shown.push(showOf(state.kept));
  }
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let budget = isInt(spec.budget) && spec.budget >= 0 ? spec.budget : 0;

  // 先接上轮压账，再接新事件；已处理过的（重放）直接跳过。
  const queue = state.ledger.map(cloneRow);
  const waiting = queue.map(function (row) { return row.eid; });
  state.ledger = [];
  events.forEach(function (event, index) {
    const eid = event && typeof event.id !== "undefined" ? event.id : index;
    if (state.applied.indexOf(eid) === -1 && waiting.indexOf(eid) === -1) {
      queue.push(toRow(event, index, spec));
    }
  });

  let served = 0;
  for (let i = 0; i < queue.length; i += 1) {
    if (budget <= 0) { state.ledger.push(queue[i]); continue; }
    applyRow(state, queue[i], spec);
    state.applied.push(queue[i].eid);
    budget -= 1;
    served += 1;
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(cloneRow),
    judged: queue.length,
    judged_bound: state.applied.length + queue.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length) {
    const row = state.ledger.shift();
    applyRow(state, row, spec);
    if (state.applied.indexOf(row.eid) === -1) state.applied.push(row.eid);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
