// src/format.js

export function formatDisplayNumber(n) {
  n = Math.max(0, Math.round(n));
  if (n >= 10_000_000) return (Math.floor(n / 100000) / 10).toFixed(1) + "M";
  if (n >= 1_000_000) return (Math.floor(n / 10000) / 100).toFixed(2) + "M";
  if (n >= 100_000) return Math.floor(n / 1000) + "K";
  if (n >= 10_000) return (Math.floor(n / 100) / 10).toFixed(1) + "K";
  if (n >= 1_000) return (Math.floor(n / 10) / 100).toFixed(2) + "K";
  return n.toString();
}
