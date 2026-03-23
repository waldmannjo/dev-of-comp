// tests/game-api.test.js
import { describe, test, expect } from "vitest";
import {
  _extractPlayerData,
  _sumAttacks,
  getGameView,
  resetGameViewCache,
} from "../src/game-api.js";

describe("_sumAttacks", () => {
  test("sums troops from attack array, excluding retreating", () => {
    const attacks = [
      { troops: 5000, retreating: false },
      { troops: 3000, retreating: true },
      { troops: 2000, retreating: false },
    ];
    expect(_sumAttacks(attacks)).toBe(7000);
  });

  test("returns 0 for empty array", () => {
    expect(_sumAttacks([])).toBe(0);
  });

  test("returns 0 when all retreating", () => {
    const attacks = [
      { troops: 5000, retreating: true },
      { troops: 3000, retreating: true },
    ];
    expect(_sumAttacks(attacks)).toBe(0);
  });
});

describe("_extractPlayerData", () => {
  test("extracts player data from mock player and game objects", () => {
    const myPlayer = { id: () => 1 };
    const player = {
      displayName: () => "TestBot",
      type: () => "Bot",
      troops: () => 12000,
      numTilesOwned: () => 5000,
      gold: () => 250000,
      totalUnitLevels: (type) => {
        const map = { City: 2, Factory: 1, Port: 1, "Missile Silo": 0, "SAM Launcher": 0 };
        return map[type] ?? 0;
      },
      outgoingAttacks: () => [{ troops: 3000, retreating: false }],
      incomingAttacks: () => [],
      isFriendly: () => false,
      isAlive: () => true,
    };
    const config = { maxTroops: () => 45000 };
    const game = {
      config: () => config,
      numLandTiles: () => 100000,
    };

    const data = _extractPlayerData(player, myPlayer, game);

    expect(data.name).toBe("TestBot");
    expect(data.troops).toBe(12000);
    expect(data.maxTroops).toBe(45000);
    expect(data.troopRatio).toBeCloseTo(12000 / 45000);
    expect(data.territory).toBe(5000);
    expect(data.territoryPercent).toBeCloseTo(5);
    expect(data.gold).toBe(250000);
    expect(data.buildings.cities).toBe(2);
    expect(data.outgoingAttacks).toBe(3000);
    expect(data.incomingAttacks).toBe(0);
    expect(data.isFriendly).toBe(false);
    expect(data.isAlive).toBe(true);
  });
});

