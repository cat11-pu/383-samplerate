// rate.js：间隔计数与展示
export function bumpOf(pending, every) {
  const next = (pending || 0) + 1;
  if (next >= every) return { pending: 0, sampled: true };
  return { pending: next, sampled: false };
}

export function showOf(kept) {
  return kept && kept.length > 0 ? kept.length : -1;
}
