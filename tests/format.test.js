// tests/format.test.js
import { formatDisplayNumber } from "../src/format.js";

describe("formatDisplayNumber", () => {
  test("formats small numbers as-is", () => {
    expect(formatDisplayNumber(0)).toBe("0");
    expect(formatDisplayNumber(999)).toBe("999");
  });

  test("formats thousands with K suffix", () => {
    expect(formatDisplayNumber(1000)).toBe("1.00K");
    expect(formatDisplayNumber(1500)).toBe("1.50K");
    expect(formatDisplayNumber(9999)).toBe("9.99K");
  });

  test("formats ten-thousands with K suffix (1 decimal)", () => {
    expect(formatDisplayNumber(10000)).toBe("10.0K");
    expect(formatDisplayNumber(25300)).toBe("25.3K");
    expect(formatDisplayNumber(99999)).toBe("99.9K");
  });

  test("formats hundred-thousands with K suffix (no decimal)", () => {
    expect(formatDisplayNumber(100000)).toBe("100K");
    expect(formatDisplayNumber(500000)).toBe("500K");
  });

  test("formats millions with M suffix", () => {
    expect(formatDisplayNumber(1000000)).toBe("1.00M");
    expect(formatDisplayNumber(5500000)).toBe("5.50M");
    expect(formatDisplayNumber(10000000)).toBe("10.0M");
    expect(formatDisplayNumber(25000000)).toBe("25.0M");
  });

  test("clamps negative values to 0", () => {
    expect(formatDisplayNumber(-100)).toBe("0");
  });
});
