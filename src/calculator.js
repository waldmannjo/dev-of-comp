const OPTIMAL_RATIO = 0.42;

export function growthPerTick(current, max) {
  if (current >= max || max <= 0) return 0;
  return (10 + Math.pow(current, 0.73) / 4) * (1 - current / max);
}

export function growthPerSecond(current, max) {
  return growthPerTick(current, max) * 10;
}

export function maxGrowthPerSecond(max) {
  return growthPerSecond(max * OPTIMAL_RATIO, max);
}

export function efficiency(current, max) {
  const maxRate = maxGrowthPerSecond(max);
  if (maxRate <= 0) return 0;
  return (growthPerSecond(current, max) / maxRate) * 100;
}

export function optimalTroops(max) {
  return Math.round(max * OPTIMAL_RATIO);
}

const RATIO_COLORS = [
  { max: 0.20, color: "#ef4444" },
  { max: 0.38, color: "#84cc16" },
  { max: 0.46, color: "#22c55e" },
  { max: 0.60, color: "#f59e0b" },
  { max: 0.85, color: "#f97316" },
  { max: Infinity, color: "#ef4444" },
];

export function getRatioColor(ratio) {
  for (const { max, color } of RATIO_COLORS) {
    if (ratio < max) return color;
  }
  return "#ef4444";
}

export function getRecommendation(ratio, attackingTroops, current) {
  const isAttacking = attackingTroops > 0;

  if (ratio > 0.85) {
    return { text: "Attack now! Growth near zero.", urgency: "high", color: "#ef4444" };
  }
  if (ratio > 0.60) {
    return {
      text: isAttacking ? "Good — attack running, troops dropping." : "Over optimum. Launch attack!",
      urgency: "medium", color: "#f97316",
    };
  }
  if (ratio > 0.46) {
    return { text: "Slightly over optimum. Good time to attack.", urgency: "medium", color: "#f59e0b" };
  }
  if (ratio >= 0.38) {
    return { text: "Optimal range! Maximum growth.", urgency: "low", color: "#22c55e" };
  }
  if (ratio >= 0.20) {
    return {
      text: isAttacking ? "Caution — troops low, attack binding resources." : "Below optimum. Let troops grow.",
      urgency: "low", color: "#84cc16",
    };
  }
  return { text: "Critically low. Do not attack!", urgency: "high", color: "#ef4444" };
}
