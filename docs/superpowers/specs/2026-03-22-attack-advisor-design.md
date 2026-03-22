# Attack Advisor — Design Spec

## Overview

Add a real-time attack advisor to the OpenFront Companion userscript. The advisor analyzes all neighboring players via the game's internal GameView API and recommends targets ranked by vulnerability, strategic value, and feasibility. Displayed as a separate floating panel alongside the existing stats panel.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data source | GameView API (`.game` on DOM elements) | Direct access to exact values for all players — troops, territory, gold, buildings, borders |
| Integration with existing code | Hybrid — new modules for advisor, existing DOM reader unchanged | Proven stats panel untouched, advisor is additive |
| UI placement | Separate floating panel below stats panel | Both visible simultaneously, independently minimizable |
| Target display | Top 3 neighbors, compact + click-to-expand | Glanceable during gameplay, detail on demand |
| Update frequency | 3s polling + event-driven recalc on significant troop change (>10%) | Balance between freshness and CPU cost |
| Troop recommendation format | Absolute + ratio % + outcome | "Send 25K (67%) — 2.5:1 advantage, recovery ~8s" |
| Language | English | User preference |

## Architecture

### New Modules

```
src/
├── game-api.js          NEW — GameView API accessor
├── attack-advisor.js    NEW — Target scoring + troop recommendation engine
├── advisor-renderer.js  NEW — Separate floating panel renderer
├── main.js              MODIFIED — wire up advisor lifecycle
```

### `game-api.js` — GameView API Accessor

Finds and caches the GameView reference from `document.querySelector('leader-board').game` (fallback: `control-panel`, `player-info-overlay`). Exposes clean data-fetching functions.

#### Exports

```javascript
getGameView()         → GameView | null
getMyPlayer()         → PlayerView | null
getAllPlayers()        → PlayerView[]       // alive, non-self
getPlayerData(player) → PlayerData | null
getBorderingPlayers() → PlayerView[]       // players sharing a border with me
```

#### `PlayerData` Shape

```javascript
{
  name: string,
  type: string,             // player.type() — PlayerType enum value
  troops: number,           // player.troops() — display units
  maxTroops: number,        // gameView.config().maxTroops(player) — NOT on PlayerView directly
  troopRatio: number,       // troops / maxTroops
  territory: number,        // player.numTilesOwned()
  territoryPercent: number, // numTilesOwned / game.numLandTiles() * 100
  gold: number,             // player.gold()
  buildings: {
    cities: number,         // player.totalUnitLevels(UnitType.City)
    factories: number,
    ports: number,
    silos: number,          // missile silos
    sams: number,           // SAM launchers
  },
  outgoingAttacks: number,  // player.outgoingAttacks().reduce((s,a) => s + a.troops, 0)
                            // Excludes retreating attacks (a.retreating === true)
  incomingAttacks: number,  // player.incomingAttacks().reduce((s,a) => s + a.troops, 0)
  isFriendly: boolean,      // player.isFriendly(myPlayer) — covers both alliance and team
  isAlive: boolean,         // player.isAlive()
}
```

**API notes:**
- `maxTroops` lives on `gameView.config().maxTroops(player)`, not on PlayerView
- `outgoingAttacks()` / `incomingAttacks()` return `AttackUpdate[]` arrays with `{ troops, retreating }` — must be summed manually, excluding retreating attacks
- Troop values from the API may be in internal units (display × 10). `game-api.js` must normalize to display units at the boundary for consistency with the existing stats panel. Verify during implementation by comparing `player.troops()` to the DOM-displayed value.

#### Border Detection

Uses `myPlayer.borderTiles()` (async, delegates to Web Worker) to get `ReadonlySet<TileRef>`, then for each border tile calls `game.neighbors(tile)` and `game.owner(neighborTile)` to collect unique bordering PlayerViews.

**Performance:** Border sets can be large (thousands of tiles for big players). To keep cost under control:
- Cache border results with a **10-second TTL** (borders change slowly)
- Force refresh on significant troop change events (the >10% trigger)
- If iteration takes >50ms, log a warning and consider sampling (every Nth border tile)

If `borderTiles()` is unavailable or throws, falls back to showing all alive non-friendly players sorted by score (degraded but functional).

### `attack-advisor.js` — Scoring Engine

#### Target Score (0–100)

Three weighted components:

**Vulnerability (0–40 points):**
- Base: `(1 - troopRatio) * 25` — lower troop fill = more vulnerable
- Distracted bonus: `+10` if player has outgoing attacks (troops committed elsewhere)
- Under attack bonus: `+5` if player has incoming attacks from others

**Strategic Value (0–30 points):**
- Territory: `min(territory% * 2, 15)` — bigger players are higher-value targets
- Economy: `+5` if cities > 0, `+5` if gold > 500K, `+5` if territory% > 15%

**Feasibility (0–30 points):**
- Based on troop advantage ratio: `myTroops / enemyDefending`
  - Ratio >= 3.0: 30 points
  - Ratio >= 2.0: 20 points
  - Ratio >= 1.5: 10 points
  - Ratio < 1.5: 0 points (can't reliably win)

**Modifiers (additive, applied after base score):**
- Player is bot → `+10` (bots have 1/3 troop capacity)
- Player has defense debuff (>150K tiles) → `+5` to `+15` (approximate sigmoid, see note below)
- Player is friendly (allied or same team) → score forced to `-1` (never recommend)

**Note on defense debuff:** The game uses a sigmoid `1 - sigmoid(tiles, ln(2)/50000, 150000)` affecting both defender effectiveness and attacker penalties. The scoring modifier is a simplified approximation — not an exact combat simulation. Large attackers also suffer penalties, which are NOT modeled here. The troop recommendation ratios (2.5:1, 1.5:1) provide enough margin to absorb this inaccuracy.

#### Rating Labels

| Score | Label | Color |
|---|---|---|
| 70–100 | `STRIKE` | `#22c55e` (green) |
| 40–69 | `RISKY` | `#f59e0b` (amber) |
| 0–39 | `AVOID` | `#ef4444` (red) |
| -1 | `ALLY` | `#888888` (gray, hidden by default) |

#### Troop Recommendation

```javascript
enemyDefending = enemy.troops - enemy.outgoingAttacks
comfortable    = enemyDefending * 2.5   // 2.5:1 ratio
minimum        = enemyDefending * 1.5   // 1.5:1 ratio
recommended    = comfortable             // default to comfortable

// Cap at available troops
recommended = min(recommended, myTroops * 0.95)

// Convert to attack ratio
attackRatio = round(recommended / myTroops * 100)

// Calculate advantage
advantage = recommended / enemyDefending  // e.g., "2.5:1"

// Recovery time: how long to reach optimal troop count after sending
troopsAfter = myTroops - recommended
recoveryTime = timeToOptimal(troopsAfter, myMaxTroops)  // reuse existing calculator
```

#### Exports

```javascript
scoreTarget(myData, enemyData)              → TargetScore
getAdvisorData(myData, enemyDataList)       → AdvisorResult
// Caller (main.js) fetches data via game-api.js and passes it in — no coupling to API module

// AdvisorResult shape:
{
  targets: [              // sorted by score descending, top 3
    {
      name: string,
      score: number,
      rating: "STRIKE" | "RISKY" | "AVOID",
      ratingColor: string,
      troops: number,
      maxTroops: number,
      troopRatio: number,
      territory: number,
      gold: number,
      buildings: { cities, factories, ports, silos, sams },
      status: string,       // "idle" | "attacking" | "under attack" | "distracted"
      recommended: number,  // troops to send
      attackRatio: number,  // slider % to set
      advantage: string,    // "2.5:1"
      recoveryTime: number, // seconds to reach optimal after attack
    }
  ],
  myTroops: number,
  myMaxTroops: number,
  lastUpdated: number,      // timestamp
}
```

### `advisor-renderer.js` — Separate Panel

Second floating panel using same visual style as existing companion panel. Positioned below the stats panel (top: stats panel bottom + 8px gap).

#### Panel States

**Full view (default):**
```
┌─ Attack Advisor ──────────── [−] [×] ┐
│                                       │
│  Bot_Germany      12K/45K    STRIKE   │
│  PlayerX          30K/80K    RISKY    │
│  Bot_France       50K/60K    AVOID    │
│                                       │
└───────────────────────────────────────┘
```

**Expanded target (click a row):**
```
│  Bot_Germany      12K/45K    STRIKE   │
│  ┌──────────────────────────────────┐ │
│  │ Troops:    12K / 45K (27%)      │ │
│  │ Territory: 8.2%                 │ │
│  │ Gold:      125K                 │ │
│  │ Cities: 1  Silos: 0  SAMs: 0   │ │
│  │ Status:    attacking (dist.)    │ │
│  │                                  │ │
│  │ Send 25K (67%) — 2.5:1          │ │
│  │ Recovery: ~8s to optimal        │ │
│  └──────────────────────────────────┘ │
```

**Minimized:**
```
┌ Advisor: Bot_Germany STRIKE ┐
```
Shows the #1 target name + rating in a single clickable line.

**No targets (no bordering enemies):**
```
┌─ Attack Advisor ──────────── [−] [×] ┐
│  No targets in range                  │
└───────────────────────────────────────┘
```

**API unavailable:**
Panel is not created at all. Existing stats panel works as before.

#### Styling

- Same CSS variables as existing panel: `rgba(17,17,17,0.92)` background, `#2a2a2a` borders, 8px radius
- Same monospace font stack
- Panel ID: `ofc-advisor-panel`
- CSS scoped under `#ofc-advisor-panel` to avoid conflicts
- Row hover: subtle background highlight
- Expanded detail: slightly inset with `#1a1a1a` background
- Rating colors match the label table above
- Reuse `formatDisplayNumber()` from `renderer.js` (extract to shared utility or import directly)

#### Exports

```javascript
createAdvisorPanel(settings)      → HTMLElement
updateAdvisorPanel(advisorResult) → void
destroyAdvisorPanel()             → void
toggleAdvisorMinimize()           → void
setAdvisorVisible(visible)        → void
```

### `main.js` Changes

#### Init Sequence

```
existing init() {
  await waitForGame()
  settings = loadSettings()
  createOverlay(settings)          // existing stats panel
  startLoop()                      // existing 500ms poll

  // NEW: advisor setup
  gameView = getGameView()
  if (gameView) {
    createAdvisorPanel(settings)
    startAdvisorLoop()
  }
}
```

#### Advisor Loop

- **Base interval:** 3000ms (3 seconds)
- **Event trigger:** If `myPlayer.troops()` changes by >10% since last advisor update, recalculate immediately
- **Troop change detection:** Checked every tick (500ms) in the existing stats loop — stores last-known troop value and compares. Near-zero cost (one number comparison per tick).
- **Error handling:** Same pattern as stats loop — consecutive error counter, hide panel after 5 failures, retry every 10s
- **Lifecycle:** Check `myPlayer.isAlive()` before running. If player is dead/spectating/not yet spawned, hide advisor panel. Re-show when player is alive again.

#### Settings Additions

| Setting | Type | Default |
|---|---|---|
| `advisorVisible` | boolean | `true` |
| `advisorMinimized` | boolean | `false` |

Persisted via existing `GM_setValue` / `localStorage` mechanism.

#### Hotkey

`F3` toggles advisor panel visibility (alongside existing `F2` for stats panel).

### Update Flow

```
advisorTick():
  gameView = getGameView()
  if (!gameView) → hide advisor, return

  myPlayer = getMyPlayer()
  neighbors = getBorderingPlayers()

  targets = neighbors
    .map(p → { data: getPlayerData(p), score: scoreTarget(myData, p) })
    .filter(t → t.score >= 0)          // exclude allies
    .sort((a,b) → b.score - a.score)
    .slice(0, 3)                        // top 3

  add troop recommendations to each target
  updateAdvisorPanel(result)
```

## Out of Scope

- No auto-clicking, automation, or game input injection
- No canvas/map overlay drawing
- No network interception or WebSocket monitoring
- No alliance recommendation engine
- No nuke advisor (future phase)
- No gold spending advisor (future phase)
- No terrain-specific attack path analysis
