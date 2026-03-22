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
    return { text: "Dringend angreifen! Wachstum fast 0.", urgency: "high", color: "#ef4444" };
  }
  if (ratio > 0.60) {
    return {
      text: isAttacking ? "Gut – Angriff läuft, Truppen sinken." : "Über Optimum. Angriff starten!",
      urgency: "medium", color: "#f97316",
    };
  }
  if (ratio > 0.46) {
    return { text: "Leicht über Optimum. Guter Angriffszeitpunkt.", urgency: "medium", color: "#f59e0b" };
  }
  if (ratio >= 0.38) {
    return { text: "Optimaler Bereich! Maximales Wachstum.", urgency: "low", color: "#22c55e" };
  }
  if (ratio >= 0.20) {
    return {
      text: isAttacking ? "Vorsicht – Truppen niedrig, Angriff bindet Ressourcen." : "Unter Optimum. Wachsen lassen.",
      urgency: "low", color: "#84cc16",
    };
  }
  return { text: "Kritisch niedrig. Nicht angreifen!", urgency: "high", color: "#ef4444" };
}
