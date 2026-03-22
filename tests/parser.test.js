import { parseNumber, parseTroopText, parseRateText, parseAttackRatioText } from "../src/parser.js";

describe("parseNumber", () => {
  test("parses plain integers", () => {
    expect(parseNumber("750")).toBe(750);
    expect(parseNumber("0")).toBe(0);
    expect(parseNumber("999")).toBe(999);
  });

  test("parses K suffix", () => {
    expect(parseNumber("1.50K")).toBe(1500);
    expect(parseNumber("12.5K")).toBe(12500);
    expect(parseNumber("150K")).toBe(150000);
  });

  test("parses M suffix", () => {
    expect(parseNumber("1.50M")).toBe(1500000);
    expect(parseNumber("12.5M")).toBe(12500000);
  });

  test("handles leading +/- signs", () => {
    expect(parseNumber("+25.0K")).toBe(25000);
    expect(parseNumber("-3.5K")).toBe(-3500);
  });

  test("returns null for unparseable input", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe("parseTroopText", () => {
  test("parses 'current / max' format from troop bar spans", () => {
    expect(parseTroopText("62.5K", "100K")).toEqual({ current: 62500, max: 100000 });
  });

  test("parses small values", () => {
    expect(parseTroopText("500", "2.50K")).toEqual({ current: 500, max: 2500 });
  });

  test("parses M-range values", () => {
    expect(parseTroopText("1.50M", "3.00M")).toEqual({ current: 1500000, max: 3000000 });
  });

  test("returns null if either value fails to parse", () => {
    expect(parseTroopText("", "100K")).toBeNull();
    expect(parseTroopText("50K", "")).toBeNull();
  });
});

describe("parseRateText", () => {
  test("parses '+25.0K/s' format", () => {
    expect(parseRateText("+25.0K/s")).toBe(25000);
  });

  test("parses '+342/s' format", () => {
    expect(parseRateText("+342/s")).toBe(342);
  });

  test("parses '+1.50M/s' format", () => {
    expect(parseRateText("+1.50M/s")).toBe(1500000);
  });

  test("returns null for unparseable input", () => {
    expect(parseRateText("")).toBeNull();
  });
});

describe("parseAttackRatioText", () => {
  test("parses '20% (12.5K)' format", () => {
    expect(parseAttackRatioText("20% (12.5K)")).toEqual({ percent: 20, troops: 12500 });
  });

  test("parses '100% (1.50M)' format", () => {
    expect(parseAttackRatioText("100% (1.50M)")).toEqual({ percent: 100, troops: 1500000 });
  });

  test("returns null for unparseable input", () => {
    expect(parseAttackRatioText("")).toBeNull();
  });
});
