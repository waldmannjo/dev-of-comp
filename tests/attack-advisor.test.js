// tests/attack-advisor.test.js
import { describe, test, expect } from "vitest";
import { scoreTarget, getAdvisorData } from "../src/attack-advisor.js";

function makePlayer(overrides = {}) {
  return {
    name: "Enemy",
    type: "Human",
    troops: 30000,
    maxTroops: 80000,
    troopRatio: 30000 / 80000,
    territory: 10000,
    territoryPercent: 10,
    gold: 200000,
    buildings: { cities: 1, factories: 0, ports: 0, silos: 0, sams: 0 },
    outgoingAttacks: 0,
    incomingAttacks: 0,
    isFriendly: false,
    isAlive: true,
    ...overrides,
  };
}

function makeMyData(overrides = {}) {
  return {
    troops: 60000,
    maxTroops: 120000,
    ...overrides,
  };
}

describe("scoreTarget", () => {
  test("returns -1 for friendly players", () => {
    const result = scoreTarget(makeMyData(), makePlayer({ isFriendly: true }));
    expect(result.score).toBe(-1);
  });

  test("returns -1 for dead players", () => {
    const result = scoreTarget(makeMyData(), makePlayer({ isAlive: false }));
    expect(result.score).toBe(-1);
  });

  test("higher score when enemy has low troop ratio", () => {
    const weak = scoreTarget(makeMyData(), makePlayer({ troops: 8000, troopRatio: 0.1 }));
    const strong = scoreTarget(makeMyData(), makePlayer({ troops: 72000, troopRatio: 0.9 }));
    expect(weak.score).toBeGreaterThan(strong.score);
  });

  test("distracted bonus when enemy has outgoing attacks", () => {
    const idle = scoreTarget(makeMyData(), makePlayer());
    const distracted = scoreTarget(makeMyData(), makePlayer({ outgoingAttacks: 15000 }));
    expect(distracted.score).toBeGreaterThan(idle.score);
  });

  test("bot bonus", () => {
    const human = scoreTarget(makeMyData(), makePlayer({ type: "Human" }));
    const bot = scoreTarget(makeMyData(), makePlayer({ type: "Bot" }));
    expect(bot.score).toBeGreaterThan(human.score);
  });

  test("feasibility is 0 when we cannot achieve 1.5:1 ratio", () => {
    const result = scoreTarget(
      makeMyData({ troops: 10000 }),
      makePlayer({ troops: 50000, troopRatio: 0.625 })
    );
    expect(result.score).toBeLessThan(30);
  });

  test("score includes strategic value for high territory", () => {
    const small = scoreTarget(makeMyData(), makePlayer({ territoryPercent: 2 }));
    const big = scoreTarget(makeMyData(), makePlayer({ territoryPercent: 20 }));
    expect(big.score).toBeGreaterThan(small.score);
  });
});

describe("getAdvisorData", () => {
  test("returns alphabetically sorted targets, excludes allies", () => {
    const myData = makeMyData({ troops: 100000 });
    const enemies = [
      makePlayer({ name: "Weak", troops: 5000, troopRatio: 0.06 }),
      makePlayer({ name: "Medium", troops: 30000, troopRatio: 0.375 }),
      makePlayer({ name: "Strong", troops: 70000, troopRatio: 0.875 }),
      makePlayer({ name: "Ally", isFriendly: true }),
    ];

    const result = getAdvisorData(myData, enemies);

    expect(result.targets.every(t => t.name !== "Ally")).toBe(true);
    const names = result.targets.map(t => t.name);
    expect(names).toEqual([...names].sort());
  });

  test("includes troop recommendation for each target", () => {
    const myData = makeMyData({ troops: 60000, maxTroops: 120000 });
    const enemies = [makePlayer({ troops: 10000, troopRatio: 0.125 })];

    const result = getAdvisorData(myData, enemies);
    const target = result.targets[0];

    expect(target.recommended).toBeGreaterThan(0);
    expect(target.attackRatio).toBeGreaterThan(0);
    expect(target.attackRatio).toBeLessThanOrEqual(100);
    expect(target.advantage).toMatch(/^\d+\.\d+:1$/);
    expect(target.recoveryTime).toBeGreaterThanOrEqual(0);
  });

  test("caps recommendation at 95% of own troops", () => {
    const myData = makeMyData({ troops: 10000, maxTroops: 120000 });
    const enemies = [makePlayer({ troops: 100000, troopRatio: 0.5 })];

    const result = getAdvisorData(myData, enemies);
    if (result.targets.length > 0) {
      expect(result.targets[0].recommended).toBeLessThanOrEqual(9500);
    }
  });

  test("returns empty targets for empty enemies list", () => {
    const result = getAdvisorData(makeMyData(), []);
    expect(result.targets).toEqual([]);
  });

  test("target has status field", () => {
    const enemies = [
      makePlayer({ name: "Idle", outgoingAttacks: 0, incomingAttacks: 0 }),
      makePlayer({ name: "Attacking", outgoingAttacks: 5000, incomingAttacks: 0 }),
      makePlayer({ name: "UnderAttack", outgoingAttacks: 0, incomingAttacks: 5000 }),
    ];

    const result = getAdvisorData(makeMyData(), enemies);
    const statuses = result.targets.map(t => t.status);
    expect(statuses).toContain("idle");
  });
});
