// src/attack-advisor.js
import { optimalTroops, growthPerSecond } from "./calculator.js";

function getRating(score) {
  if (score >= 60) return { label: "STRIKE", color: "#22c55e" };
  if (score >= 35) return { label: "RISKY", color: "#f59e0b" };
  return { label: "AVOID", color: "#ef4444" };
}

export function scoreTarget(myData, enemy) {
  if (enemy.isFriendly || !enemy.isAlive) return { score: -1 };

  const enemyDefending = Math.max(0, enemy.troops - enemy.outgoingAttacks);

  // Vulnerability (0-40)
  let vulnerability = (1 - enemy.troopRatio) * 25;
  if (enemy.outgoingAttacks > 0) vulnerability += 10;
  if (enemy.incomingAttacks > 0) vulnerability += 5;
  vulnerability = Math.min(vulnerability, 40);

  // Strategic Value (0-30)
  let strategic = Math.min(enemy.territoryPercent * 2, 15);
  if (enemy.buildings.cities > 0) strategic += 5;
  if (enemy.gold > 500000) strategic += 5;
  if (enemy.territoryPercent > 15) strategic += 5;
  strategic = Math.min(strategic, 30);

  // Feasibility (0-40) — scales with troop advantage
  const ratio = enemyDefending > 0 ? myData.troops / enemyDefending : 100;
  let feasibility = 0;
  if (ratio >= 5.0) feasibility = 40;
  else if (ratio >= 3.0) feasibility = 30;
  else if (ratio >= 2.0) feasibility = 20;
  else if (ratio >= 1.5) feasibility = 10;

  let score = vulnerability + strategic + feasibility;

  // Modifiers
  if (String(enemy.type) === "Bot") score += 10;
  if (enemy.territory > 150000) {
    const debuffBonus = Math.min(15, Math.max(5, (enemy.territory - 150000) / 20000));
    score += debuffBonus;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score };
}

function getStatus(enemy) {
  const hasOut = enemy.outgoingAttacks > 0;
  const hasIn = enemy.incomingAttacks > 0;
  if (hasOut && hasIn) return "distracted";
  if (hasOut) return "attacking";
  if (hasIn) return "under attack";
  return "idle";
}

export function computeThreatLevel(myData, allEnemies, targetName) {
  const others = allEnemies.filter(
    e => e.isAlive && !e.isFriendly && e.name !== targetName
  );
  // Base: more active enemies = more threat (0..1)
  let threat = Math.min(1, others.length / 5);
  // Bonus if we're currently under attack
  if ((myData.incomingAttacks || 0) > 0) threat += 0.2;
  // Bonus if strongest other enemy has >50% of our troops
  const strongestOther = others.reduce((max, e) => Math.max(max, e.troops), 0);
  if (myData.troops > 0 && strongestOther > myData.troops * 0.5) threat += 0.15;
  return Math.min(1, threat);
}

function computeRecommendation(myData, enemy, allEnemies) {
  const enemyDefending = Math.max(1, enemy.troops - enemy.outgoingAttacks);

  // Dynamic multiplier: less overkill when we massively outgun the target
  const ratio = myData.troops / enemyDefending;
  let multiplier;
  if (ratio > 10) multiplier = 1.3;
  else if (ratio > 5) multiplier = 1.8;
  else if (ratio > 3) multiplier = 2.0;
  else if (ratio > 2) multiplier = 2.2;
  else multiplier = 2.5;

  const needed = enemyDefending * multiplier;

  // Threat-aware reserve: keep 15%-40% of maxTroops depending on danger
  const threatLevel = computeThreatLevel(myData, allEnemies, enemy.name);
  const minReserve = myData.maxTroops * (0.15 + threatLevel * 0.25);
  const budget = Math.max(0, myData.troops - minReserve);

  let recommended = Math.min(needed, budget, myData.troops * 0.95);
  recommended = Math.max(0, Math.round(recommended));

  const attackRatio = myData.troops > 0
    ? Math.round((recommended / myData.troops) * 100)
    : 0;

  const advantage = enemyDefending > 0
    ? (recommended / enemyDefending).toFixed(1) + ":1"
    : "---";

  const troopsAfter = myData.troops - recommended;
  const optimal = optimalTroops(myData.maxTroops);
  let recoveryTime = 0;
  if (troopsAfter < optimal) {
    const rate = growthPerSecond(troopsAfter, myData.maxTroops);
    recoveryTime = rate > 0 ? (optimal - troopsAfter) / rate : Infinity;
  }

  return { recommended, attackRatio, advantage, recoveryTime, threatLevel };
}

export function getAdvisorData(myData, enemyDataList) {
  const scored = enemyDataList
    .map(enemy => {
      const { score } = scoreTarget(myData, enemy);
      if (score < 0) return null;
      const rating = getRating(score);
      const rec = computeRecommendation(myData, enemy, enemyDataList);
      return {
        name: enemy.name,
        score,
        rating: rating.label,
        ratingColor: rating.color,
        troops: enemy.troops,
        maxTroops: enemy.maxTroops,
        troopRatio: enemy.troopRatio,
        territory: enemy.territory,
        territoryPercent: enemy.territoryPercent,
        gold: enemy.gold,
        buildings: enemy.buildings,
        status: getStatus(enemy),
        ...rec,
      };
    })
    .filter(t => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    targets: scored,
    myTroops: myData.troops,
    myMaxTroops: myData.maxTroops,
    lastUpdated: Date.now(),
  };
}
