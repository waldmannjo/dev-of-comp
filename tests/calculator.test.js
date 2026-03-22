import {
  growthPerTick,
  growthPerSecond,
  maxGrowthPerSecond,
  efficiency,
  optimalTroops,
  getRecommendation,
  getRatioColor,
} from "../src/calculator.js";

describe("growthPerTick", () => {
  test("returns 0 when current >= max", () => {
    expect(growthPerTick(100000, 100000)).toBe(0);
    expect(growthPerTick(150000, 100000)).toBe(0);
  });

  test("returns 0 when max <= 0", () => {
    expect(growthPerTick(0, 0)).toBe(0);
    expect(growthPerTick(0, -1)).toBe(0);
  });

  test("returns positive value for valid inputs", () => {
    const result = growthPerTick(50000, 120000);
    expect(result).toBeGreaterThan(0);
  });

  test("rate is highest near optimal ratio (~0.42)", () => {
    const max = 500000;
    const mid = growthPerTick(max * 0.42, max);
    const high = growthPerTick(max * 0.9, max);
    const low = growthPerTick(max * 0.1, max);
    expect(mid).toBeGreaterThan(high);
    expect(mid).toBeGreaterThan(low);
  });
});

describe("growthPerSecond", () => {
  test("is 10x growthPerTick (10 ticks/second)", () => {
    const perTick = growthPerTick(50000, 120000);
    expect(growthPerSecond(50000, 120000)).toBeCloseTo(perTick * 10, 5);
  });
});

describe("maxGrowthPerSecond", () => {
  test("returns the growth rate at optimal ratio", () => {
    const max = 500000;
    const optimal = maxGrowthPerSecond(max);
    const atHalf = growthPerSecond(max * 0.5, max);
    const atQuarter = growthPerSecond(max * 0.25, max);
    expect(optimal).toBeGreaterThanOrEqual(atHalf);
    expect(optimal).toBeGreaterThanOrEqual(atQuarter);
  });
});

describe("efficiency", () => {
  test("returns 100% at optimal ratio", () => {
    const max = 500000;
    const eff = efficiency(max * 0.42, max);
    expect(eff).toBeCloseTo(100, 0);
  });

  test("returns less than 100% away from optimal", () => {
    const max = 500000;
    expect(efficiency(max * 0.1, max)).toBeLessThan(100);
    expect(efficiency(max * 0.9, max)).toBeLessThan(100);
  });

  test("returns 0 when max is 0", () => {
    expect(efficiency(0, 0)).toBe(0);
  });
});

describe("optimalTroops", () => {
  test("returns 42% of max, rounded", () => {
    expect(optimalTroops(100000)).toBe(42000);
    expect(optimalTroops(500000)).toBe(210000);
  });
});

describe("getRecommendation", () => {
  test("critical high: ratio > 0.85", () => {
    const rec = getRecommendation(0.90, 0, 90000);
    expect(rec.urgency).toBe("high");
    expect(rec.color).toBe("#ef4444");
  });

  test("optimal zone: ratio 0.38-0.46", () => {
    const rec = getRecommendation(0.42, 0, 42000);
    expect(rec.urgency).toBe("low");
    expect(rec.color).toBe("#22c55e");
  });

  test("critical low: ratio < 0.20", () => {
    const rec = getRecommendation(0.10, 0, 10000);
    expect(rec.urgency).toBe("high");
    expect(rec.color).toBe("#ef4444");
  });

  test("over optimal with active attack", () => {
    const rec = getRecommendation(0.70, 5000, 70000);
    expect(rec.urgency).toBe("medium");
    expect(rec.text).toContain("Angriff");
  });

  test("under optimal with active attack", () => {
    const rec = getRecommendation(0.25, 5000, 25000);
    expect(rec.text).toContain("Vorsicht");
  });
});

describe("getRatioColor", () => {
  test("returns red for extreme values", () => {
    expect(getRatioColor(0.10)).toBe("#ef4444");
    expect(getRatioColor(0.90)).toBe("#ef4444");
  });

  test("returns green for optimal zone", () => {
    expect(getRatioColor(0.42)).toBe("#22c55e");
  });

  test("returns orange for over-optimal zone", () => {
    expect(getRatioColor(0.70)).toBe("#f97316");
  });
});
