// tests/history.test.js
import { TroopHistory } from "../src/history.js";

describe("TroopHistory", () => {
  test("stores entries and respects max size", () => {
    const h = new TroopHistory(5);
    for (let i = 0; i < 10; i++) {
      h.push(i * 100, 1000, i * 500);
    }
    expect(h.getChartData()).toHaveLength(5);
  });

  test("getChartData returns ratio as percentage and timestamp", () => {
    const h = new TroopHistory();
    h.push(420, 1000, 1000);
    const data = h.getChartData();
    expect(data[0]).toEqual({ ratio: 42, ts: 1000 });
  });

  test("getTrend returns 'unknown' with insufficient data", () => {
    const h = new TroopHistory();
    h.push(100, 1000, 0);
    expect(h.getTrend()).toBe("unknown");
  });

  test("getTrend detects rising ratio", () => {
    const h = new TroopHistory();
    for (let i = 0; i < 10; i++) h.push(300, 1000, i * 500);
    for (let i = 10; i < 20; i++) h.push(500, 1000, i * 500);
    expect(h.getTrend()).toBe("rising");
  });

  test("getTrend detects falling ratio", () => {
    const h = new TroopHistory();
    for (let i = 0; i < 10; i++) h.push(500, 1000, i * 500);
    for (let i = 10; i < 20; i++) h.push(300, 1000, i * 500);
    expect(h.getTrend()).toBe("falling");
  });

  test("getTrend detects stable ratio", () => {
    const h = new TroopHistory();
    for (let i = 0; i < 20; i++) h.push(420, 1000, i * 500);
    expect(h.getTrend()).toBe("stable");
  });

  test("reset clears all entries", () => {
    const h = new TroopHistory();
    h.push(100, 1000, 0);
    h.reset();
    expect(h.getChartData()).toHaveLength(0);
    expect(h.getTrend()).toBe("unknown");
  });
});
