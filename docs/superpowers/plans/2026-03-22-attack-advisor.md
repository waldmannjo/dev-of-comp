# Attack Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time attack advisor panel that recommends which neighboring players to attack and with what troop strength.

**Architecture:** Three new modules (`game-api.js`, `attack-advisor.js`, `advisor-renderer.js`) alongside the existing codebase. The GameView API is accessed via `document.querySelector('leader-board').game` for enemy data. Existing DOM reader for own stats is unchanged. A separate floating panel renders the top 3 targets.

**Tech Stack:** Vanilla JS, esbuild bundler, vitest for tests. Tampermonkey userscript target.

**Spec:** `docs/superpowers/specs/2026-03-22-attack-advisor-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/format.js` | NEW | Extract `formatDisplayNumber()` from renderer — shared utility |
| `src/game-api.js` | NEW | GameView API accessor — find game ref, fetch player data, border detection |
| `src/attack-advisor.js` | NEW | Target scoring engine + troop recommendations |
| `src/advisor-renderer.js` | NEW | Separate floating panel with compact/expanded/minimized states |
| `src/renderer.js` | MODIFY | Import `formatDisplayNumber` from `format.js` instead of local definition |
| `src/settings.js` | MODIFY | Add `advisorMinimized` and `advisorHotkey` defaults |
| `src/main.js` | MODIFY | Wire up advisor lifecycle, second poll loop, F3 hotkey |
| `tests/format.test.js` | NEW | Tests for shared formatter |
| `tests/attack-advisor.test.js` | NEW | Tests for scoring engine + troop recommendations |
| `tests/game-api.test.js` | NEW | Tests for player data extraction logic |

---

### Task 1: Extract `formatDisplayNumber` to shared utility

**Files:**
- Create: `src/format.js`
- Create: `tests/format.test.js`
- Modify: `src/renderer.js:260-268` (remove local function, add import)

- [ ] **Step 1: Write the test file**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/format.test.js`
Expected: FAIL — `format.js` does not exist

- [ ] **Step 3: Create `src/format.js` by extracting from renderer**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/format.test.js`
Expected: PASS

- [ ] **Step 5: Update `src/renderer.js` to import from `format.js`**

At the top of `src/renderer.js`, add:
```javascript
import { formatDisplayNumber } from "./format.js";
```

Delete the local `formatDisplayNumber` function (lines 260-268 of `src/renderer.js`).

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 7: Build to verify bundle works**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 8: Commit**

```bash
git add src/format.js tests/format.test.js src/renderer.js
git commit -m "refactor: extract formatDisplayNumber to shared format.js"
```

---

### Task 2: Implement `game-api.js` — GameView API accessor

**Files:**
- Create: `src/game-api.js`
- Create: `tests/game-api.test.js`

- [ ] **Step 1: Write the test file**

The GameView API requires browser DOM with custom elements. Tests use mocks to verify the data extraction and transformation logic.

```javascript
// tests/game-api.test.js
import { describe, test, expect } from "vitest";
import {
  _extractPlayerData,
  _sumAttacks,
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
        const map = { City: 2, Factory: 1, Port: 1, MissileSilo: 0, SAMLauncher: 0 };
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

```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game-api.test.js`
Expected: FAIL — `game-api.js` does not exist

- [ ] **Step 3: Implement `src/game-api.js`**

```javascript
// src/game-api.js

const GAME_ELEMENT_SELECTORS = ["leader-board", "control-panel", "player-info-overlay"];
const BORDER_CACHE_TTL = 10000; // 10 seconds

let cachedGameView = null;
let borderCache = { players: [], timestamp: 0 };

// Unit type strings matching the game's UnitType enum
const UNIT_TYPES = {
  City: "City",
  Factory: "Factory",
  Port: "Port",
  MissileSilo: "MissileSilo",
  SAMLauncher: "SAMLauncher",
};

export function getGameView() {
  if (cachedGameView) return cachedGameView;
  for (const sel of GAME_ELEMENT_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el && el.game) {
        cachedGameView = el.game;
        return cachedGameView;
      }
    } catch { /* skip */ }
  }
  return null;
}

export function resetGameViewCache() {
  cachedGameView = null;
  borderCache = { players: [], timestamp: 0 };
}

export function getMyPlayer() {
  const game = getGameView();
  if (!game) return null;
  try {
    const p = game.myPlayer();
    return p && p.isAlive() ? p : null;
  } catch { return null; }
}

export function getAllPlayers() {
  const game = getGameView();
  const me = getMyPlayer();
  if (!game || !me) return [];
  try {
    return game.playerViews().filter(p => p.isAlive() && p.id() !== me.id());
  } catch { return []; }
}

export function getPlayerData(player) {
  const game = getGameView();
  const me = getMyPlayer();
  if (!game || !me) return null;
  try {
    return _extractPlayerData(player, me, game);
  } catch { return null; }
}

export function _extractPlayerData(player, myPlayer, game) {
  const troops = player.troops();
  const maxTroops = game.config().maxTroops(player);
  const territory = player.numTilesOwned();
  const totalLand = game.numLandTiles();

  return {
    name: player.displayName(),
    type: String(player.type()),
    troops,
    maxTroops,
    troopRatio: maxTroops > 0 ? troops / maxTroops : 0,
    territory,
    territoryPercent: totalLand > 0 ? (territory / totalLand) * 100 : 0,
    gold: player.gold(),
    buildings: {
      cities: player.totalUnitLevels(UNIT_TYPES.City),
      factories: player.totalUnitLevels(UNIT_TYPES.Factory),
      ports: player.totalUnitLevels(UNIT_TYPES.Port),
      silos: player.totalUnitLevels(UNIT_TYPES.MissileSilo),
      sams: player.totalUnitLevels(UNIT_TYPES.SAMLauncher),
    },
    outgoingAttacks: _sumAttacks(player.outgoingAttacks()),
    incomingAttacks: _sumAttacks(player.incomingAttacks()),
    isFriendly: player.isFriendly(myPlayer),
    isAlive: player.isAlive(),
  };
}

export function _sumAttacks(attacks) {
  let sum = 0;
  for (const a of attacks) {
    if (!a.retreating) sum += a.troops;
  }
  return sum;
}

export async function getBorderingPlayers() {
  const now = Date.now();
  if (now - borderCache.timestamp < BORDER_CACHE_TTL && borderCache.players.length > 0) {
    return borderCache.players;
  }

  const game = getGameView();
  const me = getMyPlayer();
  if (!game || !me) return getAllPlayers(); // fallback

  try {
    const borderData = await me.borderTiles();
    const borderTiles = borderData.borderTiles;
    const neighborIds = new Set();
    const neighborPlayers = [];
    const myId = me.id();

    for (const tile of borderTiles) {
      for (const adj of game.neighbors(tile)) {
        const owner = game.owner(adj);
        if (owner && owner.isPlayer && owner.isPlayer() && owner.id() !== myId) {
          if (!neighborIds.has(owner.id())) {
            neighborIds.add(owner.id());
            neighborPlayers.push(owner);
          }
        }
      }
    }

    borderCache = { players: neighborPlayers, timestamp: now };
    return neighborPlayers;
  } catch {
    return getAllPlayers(); // fallback
  }
}

export function invalidateBorderCache() {
  borderCache.timestamp = 0;
}

```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game-api.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game-api.js tests/game-api.test.js
git commit -m "feat: add GameView API accessor for enemy player data"
```

---

### Task 3: Implement `attack-advisor.js` — scoring engine

**Files:**
- Create: `src/attack-advisor.js`
- Create: `tests/attack-advisor.test.js`

- [ ] **Step 1: Write the test file**

```javascript
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
    // myTroops(10K) / enemyDefending(50K) = 0.2 — way below 1.5
    expect(result.score).toBeLessThan(30);
  });

  test("score includes strategic value for high territory", () => {
    const small = scoreTarget(makeMyData(), makePlayer({ territoryPercent: 2 }));
    const big = scoreTarget(makeMyData(), makePlayer({ territoryPercent: 20 }));
    expect(big.score).toBeGreaterThan(small.score);
  });
});

describe("getAdvisorData", () => {
  test("returns sorted targets, top 3", () => {
    const myData = makeMyData({ troops: 100000 });
    const enemies = [
      makePlayer({ name: "Weak", troops: 5000, troopRatio: 0.06 }),
      makePlayer({ name: "Medium", troops: 30000, troopRatio: 0.375 }),
      makePlayer({ name: "Strong", troops: 70000, troopRatio: 0.875 }),
      makePlayer({ name: "Ally", isFriendly: true }),
    ];

    const result = getAdvisorData(myData, enemies);

    expect(result.targets.length).toBeLessThanOrEqual(3);
    expect(result.targets[0].name).toBe("Weak");
    // No allies in targets
    expect(result.targets.every(t => t.name !== "Ally")).toBe(true);
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
    // Enemy defending 100K — comfortable would be 250K, way over our 10K
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/attack-advisor.test.js`
Expected: FAIL — `attack-advisor.js` does not exist

- [ ] **Step 3: Implement `src/attack-advisor.js`**

```javascript
// src/attack-advisor.js
import { optimalTroops, growthPerSecond } from "./calculator.js";

function getRating(score) {
  if (score >= 70) return { label: "STRIKE", color: "#22c55e" };
  if (score >= 40) return { label: "RISKY", color: "#f59e0b" };
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

  // Feasibility (0-30)
  const ratio = enemyDefending > 0 ? myData.troops / enemyDefending : 100;
  let feasibility = 0;
  if (ratio >= 3.0) feasibility = 30;
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

function computeRecommendation(myData, enemy) {
  const enemyDefending = Math.max(1, enemy.troops - enemy.outgoingAttacks);
  const comfortable = enemyDefending * 2.5;
  let recommended = Math.min(comfortable, myData.troops * 0.95);
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

  return { recommended, attackRatio, advantage, recoveryTime };
}

export function getAdvisorData(myData, enemyDataList) {
  const scored = enemyDataList
    .map(enemy => {
      const { score } = scoreTarget(myData, enemy);
      if (score < 0) return null;
      const rating = getRating(score);
      const rec = computeRecommendation(myData, enemy);
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
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    targets: scored,
    myTroops: myData.troops,
    myMaxTroops: myData.maxTroops,
    lastUpdated: Date.now(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/attack-advisor.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/attack-advisor.js tests/attack-advisor.test.js
git commit -m "feat: add attack advisor scoring engine with troop recommendations"
```

---

### Task 4: Implement `advisor-renderer.js` — floating panel

**Files:**
- Create: `src/advisor-renderer.js`

No unit tests for this module — it is pure DOM construction, tested via manual browser verification during integration.

- [ ] **Step 1: Create `src/advisor-renderer.js`**

```javascript
// src/advisor-renderer.js
import { formatDisplayNumber } from "./format.js";
import { saveSetting } from "./settings.js";

const PANEL_ID = "ofc-advisor-panel";

export const ADVISOR_STYLES = `
#${PANEL_ID} {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 280px;
  z-index: 9989;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: #e5e5e5;
  pointer-events: auto;
  user-select: none;
}
#${PANEL_ID} .ofc-adv-panel {
  background: rgba(17, 17, 17, 0.92);
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}
#${PANEL_ID} .ofc-adv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 1px solid #2a2a2a;
  cursor: default;
}
#${PANEL_ID} .ofc-adv-header-title {
  font-weight: 700;
  font-size: 13px;
}
#${PANEL_ID} .ofc-adv-header-btns button {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}
#${PANEL_ID} .ofc-adv-header-btns button:hover { color: #fff; }
#${PANEL_ID} .ofc-adv-body { padding: 4px 0; }
#${PANEL_ID} .ofc-adv-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  cursor: pointer;
  transition: background-color 0.15s;
}
#${PANEL_ID} .ofc-adv-row:hover { background: rgba(255,255,255,0.05); }
#${PANEL_ID} .ofc-adv-row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
#${PANEL_ID} .ofc-adv-row-troops {
  font-size: 10px;
  color: #888;
  margin: 0 8px;
  white-space: nowrap;
}
#${PANEL_ID} .ofc-adv-row-rating {
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
#${PANEL_ID} .ofc-adv-detail {
  background: #1a1a1a;
  margin: 0 6px 4px 6px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 10px;
  color: #ccc;
  display: none;
}
#${PANEL_ID} .ofc-adv-detail.ofc-adv-open { display: block; }
#${PANEL_ID} .ofc-adv-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}
#${PANEL_ID} .ofc-adv-detail-label { color: #888; }
#${PANEL_ID} .ofc-adv-detail-sep {
  border-top: 1px solid #2a2a2a;
  margin: 4px 0;
}
#${PANEL_ID} .ofc-adv-rec { font-weight: 600; }
#${PANEL_ID} .ofc-adv-empty {
  padding: 8px 10px;
  color: #666;
  font-size: 11px;
}
#${PANEL_ID} .ofc-adv-minimized {
  padding: 4px 10px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  display: none;
}
#${PANEL_ID}.ofc-hidden { display: none; }
`;

let panelEl = null;
let isMinimized = false;
let expandedIndex = -1;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function buildPanel() {
  const root = el("div", "ofc-adv-panel");

  const header = el("div", "ofc-adv-header");
  header.appendChild(el("span", "ofc-adv-header-title", "Attack Advisor"));
  const btns = el("span", "ofc-adv-header-btns");
  const minBtn = el("button", null, "\u2212");
  minBtn.title = "Minimize";
  btns.appendChild(minBtn);
  const closeBtn = el("button", null, "\u00d7");
  closeBtn.title = "Close";
  btns.appendChild(closeBtn);
  header.appendChild(btns);
  root.appendChild(header);

  const body = el("div", "ofc-adv-body");
  body.dataset.field = "advisor-body";
  root.appendChild(body);

  const minView = el("div", "ofc-adv-minimized");
  minView.dataset.field = "advisor-min";
  root.appendChild(minView);

  return { root, minBtn, closeBtn, body, minView };
}

export function createAdvisorPanel(settings) {
  if (typeof GM_addStyle === "function") {
    GM_addStyle(ADVISOR_STYLES);
  } else {
    const style = document.createElement("style");
    style.textContent = ADVISOR_STYLES;
    document.head.appendChild(style);
  }

  isMinimized = settings.advisorMinimized ?? false;
  expandedIndex = -1;

  const wrapper = document.createElement("div");
  wrapper.id = PANEL_ID;
  const { root, minBtn, closeBtn, minView } = buildPanel();
  wrapper.appendChild(root);
  document.body.appendChild(wrapper);
  panelEl = wrapper;

  minBtn.addEventListener("click", toggleAdvisorMinimize);
  closeBtn.addEventListener("click", () => setAdvisorVisible(false));
  minView.addEventListener("click", toggleAdvisorMinimize);

  if (isMinimized) applyMinimized();
  positionBelowCompanion();
  return wrapper;
}

function positionBelowCompanion() {
  if (!panelEl) return;
  const companion = document.getElementById("ofc-companion-panel");
  if (companion) {
    const rect = companion.getBoundingClientRect();
    panelEl.style.top = (rect.bottom + 8) + "px";
    panelEl.style.right = "10px";
  }
}

export function updateAdvisorPanel(result) {
  if (!panelEl) return;
  positionBelowCompanion();

  const minView = panelEl.querySelector('[data-field="advisor-min"]');
  if (minView) {
    if (result.targets.length > 0) {
      const t = result.targets[0];
      minView.textContent = "Advisor: " + t.name + " " + t.rating;
      minView.style.color = t.ratingColor;
    } else {
      minView.textContent = "Advisor: no targets";
      minView.style.color = "#666";
    }
  }

  if (isMinimized) return;

  const body = panelEl.querySelector('[data-field="advisor-body"]');
  if (!body) return;

  // Clear body safely (no innerHTML)
  while (body.firstChild) body.removeChild(body.firstChild);

  if (result.targets.length === 0) {
    body.appendChild(el("div", "ofc-adv-empty", "No targets in range"));
    return;
  }

  const fmt = formatDisplayNumber;

  result.targets.forEach((target, i) => {
    const row = el("div", "ofc-adv-row");
    const nameSpan = el("span", "ofc-adv-row-name", target.name);
    nameSpan.style.color = target.ratingColor;
    row.appendChild(nameSpan);
    row.appendChild(el("span", "ofc-adv-row-troops",
      fmt(target.troops) + "/" + fmt(target.maxTroops)));
    const ratingSpan = el("span", "ofc-adv-row-rating", target.rating);
    ratingSpan.style.color = target.ratingColor;
    row.appendChild(ratingSpan);

    const detail = el("div", "ofc-adv-detail");
    if (i === expandedIndex) detail.classList.add("ofc-adv-open");

    const addDetailRow = (label, value) => {
      const r = el("div", "ofc-adv-detail-row");
      r.appendChild(el("span", "ofc-adv-detail-label", label));
      r.appendChild(el("span", null, value));
      detail.appendChild(r);
    };

    addDetailRow("Troops", fmt(target.troops) + " / " + fmt(target.maxTroops)
      + " (" + (target.troopRatio * 100).toFixed(0) + "%)");
    addDetailRow("Territory", target.territoryPercent.toFixed(1) + "%");
    addDetailRow("Gold", fmt(target.gold));
    addDetailRow("Buildings",
      "C:" + target.buildings.cities
      + " S:" + target.buildings.silos
      + " SAM:" + target.buildings.sams);
    addDetailRow("Status", target.status);

    detail.appendChild(el("div", "ofc-adv-detail-sep"));

    const recText = "Send " + fmt(target.recommended)
      + " (" + target.attackRatio + "%) \u2014 " + target.advantage;
    const recEl = el("div", "ofc-adv-rec", recText);
    recEl.style.color = target.ratingColor;
    detail.appendChild(recEl);

    const recTime = target.recoveryTime === Infinity
      ? "Recovery: ---"
      : target.recoveryTime === 0
        ? "Recovery: instant"
        : "Recovery: ~" + target.recoveryTime.toFixed(0) + "s to optimal";
    detail.appendChild(el("div", "ofc-adv-detail-label", recTime));

    row.addEventListener("click", () => {
      expandedIndex = expandedIndex === i ? -1 : i;
      const allDetails = body.querySelectorAll(".ofc-adv-detail");
      allDetails.forEach((d, idx) => {
        d.classList.toggle("ofc-adv-open", idx === expandedIndex);
      });
    });

    body.appendChild(row);
    body.appendChild(detail);
  });
}

export function toggleAdvisorMinimize() {
  isMinimized = !isMinimized;
  applyMinimized();
  saveSetting("advisorMinimized", isMinimized);
  return isMinimized;
}

function applyMinimized() {
  if (!panelEl) return;
  const body = panelEl.querySelector(".ofc-adv-body");
  const header = panelEl.querySelector(".ofc-adv-header");
  const minView = panelEl.querySelector('[data-field="advisor-min"]');
  if (body) body.style.display = isMinimized ? "none" : "";
  if (header) header.style.display = isMinimized ? "none" : "";
  if (minView) minView.style.display = isMinimized ? "" : "none";
}

export function setAdvisorVisible(visible) {
  if (panelEl) panelEl.classList.toggle("ofc-hidden", !visible);
}

export function destroyAdvisorPanel() {
  panelEl?.remove();
  panelEl = null;
  expandedIndex = -1;
}
```

- [ ] **Step 2: Build to verify no syntax errors**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add src/advisor-renderer.js
git commit -m "feat: add advisor floating panel renderer with expand/minimize"
```

---

### Task 5: Update `settings.js` with advisor defaults

**Files:**
- Modify: `src/settings.js:3-8`

- [ ] **Step 1: Add advisor settings to DEFAULTS**

In `src/settings.js`, update the `DEFAULTS` object:

```javascript
export const DEFAULTS = {
  minimized: false,
  showChart: true,
  compactMode: false,
  opacity: 0.92,
  hotkey: "F2",
  advisorVisible: true,
  advisorMinimized: false,
  advisorHotkey: "F3",
};
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/settings.js
git commit -m "feat: add advisor settings defaults (minimized, hotkey)"
```

---

### Task 6: Wire up advisor in `main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add imports at top of `main.js`**

Add after existing imports:

```javascript
import {
  getGameView,
  getMyPlayer,
  getPlayerData,
  getBorderingPlayers,
  invalidateBorderCache,
} from "./game-api.js";
import { getAdvisorData } from "./attack-advisor.js";
import {
  createAdvisorPanel,
  updateAdvisorPanel,
  setAdvisorVisible,
  toggleAdvisorMinimize,
} from "./advisor-renderer.js";
```

- [ ] **Step 2: Add advisor state variables**

After the existing `let cachedHotkey = "F2";` line, add:

```javascript
let advisorIntervalId = null;
let cachedAdvisorHotkey = "F3";
let lastAdvisorTroops = 0;
let consecutiveAdvisorErrors = 0;
const ADVISOR_INTERVAL = 3000;
const ADVISOR_MAX_ERRORS = 5;
const TROOP_CHANGE_THRESHOLD = 0.10;
```

- [ ] **Step 3: Add `advisorTick()` function**

After the existing `tick()` function, add:

```javascript
async function advisorTick() {
  const game = getGameView();
  if (!game) {
    setAdvisorVisible(false);
    return;
  }

  const me = getMyPlayer();
  if (!me) {
    setAdvisorVisible(false);
    return;
  }

  setAdvisorVisible(true);

  try {
    // Read own data directly — avoid routing through getPlayerData
    // which calls isFriendly(myPlayer) on self (undefined behavior)
    const myTroops = me.troops();
    const myMaxTroops = game.config().maxTroops(me);
    const myData = { troops: myTroops, maxTroops: myMaxTroops };

    const neighbors = await getBorderingPlayers();
    const enemyDataList = neighbors
      .map(p => getPlayerData(p))
      .filter(d => d !== null);

    const result = getAdvisorData(myData, enemyDataList);
    updateAdvisorPanel(result);
    lastAdvisorTroops = myTroops;
    consecutiveAdvisorErrors = 0;
  } catch (e) {
    consecutiveAdvisorErrors++;
    if (consecutiveAdvisorErrors > ADVISOR_MAX_ERRORS) {
      setAdvisorVisible(false);
      console.warn("[OF-Companion] Advisor: too many errors, hiding panel.");
    }
  }
}
```

- [ ] **Step 4: Add `startAdvisorLoop()` and troop change detection**

```javascript
function startAdvisorLoop() {
  if (advisorIntervalId) return;
  advisorTick();
  advisorIntervalId = setInterval(advisorTick, ADVISOR_INTERVAL);
  console.log("[OF-Companion] Advisor started, polling every " + ADVISOR_INTERVAL + "ms");
}

function checkTroopChange(currentTroops) {
  if (lastAdvisorTroops === 0) return;
  const change = Math.abs(currentTroops - lastAdvisorTroops) / lastAdvisorTroops;
  if (change >= TROOP_CHANGE_THRESHOLD) {
    invalidateBorderCache();
    advisorTick();
  }
}
```

- [ ] **Step 5: Modify existing `tick()` to include troop change check**

In the existing `tick()` function, after `updateOverlay(stats);`, add:

```javascript
  checkTroopChange(state.currentTroops);
```

- [ ] **Step 6: Modify `handleHotkey` for F3**

Replace the existing `handleHotkey` function:

```javascript
function handleHotkey(e) {
  if (e.key === cachedHotkey) {
    toggleMinimize();
    e.preventDefault();
  }
  if (e.key === cachedAdvisorHotkey) {
    toggleAdvisorMinimize();
    e.preventDefault();
  }
}
```

- [ ] **Step 7: Modify `init()` to set up advisor**

In the `init()` function, after `startLoop();`, add:

```javascript
  cachedAdvisorHotkey = settings.advisorHotkey;
  const game = getGameView();
  if (game) {
    createAdvisorPanel(settings);
    startAdvisorLoop();
  } else {
    console.log("[OF-Companion] GameView not available, advisor disabled.");
  }
```

- [ ] **Step 8: Build and verify**

Run: `npm run build`
Expected: Builds successfully, output in `dist/openfront-companion.user.js`

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add src/main.js
git commit -m "feat: wire up attack advisor lifecycle in main loop"
```

---

### Task 7: Build distribution bundle and verify

**Files:**
- Modify: `dist/openfront-companion.user.js` (rebuilt)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Successful build

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Verify bundle includes advisor code**

Run: `grep -c "Attack Advisor" dist/openfront-companion.user.js`
Expected: At least 1 match

Run: `grep -c "advisorTick" dist/openfront-companion.user.js`
Expected: At least 1 match

- [ ] **Step 4: Commit built bundle**

```bash
git add dist/openfront-companion.user.js
git commit -m "chore: rebuild userscript with attack advisor"
```
