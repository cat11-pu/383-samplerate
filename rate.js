// rate.js：间隔计数与展示（基线：一律给原值与负一）
export function bumpOf(pending, every) {
  return { pending: pending, sampled: false };
}

export function showOf(kept) {
  return -1;
}
