// ==UserScript==
// @name         OpenFront Companion - Troop Ratio Optimizer
// @namespace    https://github.com/user/openfront-companion
// @version      1.0.0
// @description  HUD overlay for OpenFront.io: real-time troop ratio, growth efficiency, and strategic recommendations.
// @author       jwa
// @match        https://openfront.io/*
// @match        https://*.openfront.io/*
// @icon         https://openfront.io/favicon.ico
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==
(() => {
  // src/parser.js
  function parseNumber(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (str === "") return null;
    const match = str.match(/^([+-]?)(\d+(?:\.\d+)?)\s*([KkMm]?)$/);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const num = parseFloat(match[2]);
    const suffix = match[3].toUpperCase();
    const multiplier = suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
    return sign * Math.round(num * multiplier);
  }
  function parseTroopText(currentStr, maxStr) {
    const current = parseNumber(currentStr);
    const max = parseNumber(maxStr);
    if (current == null || max == null) return null;
    return { current, max };
  }
  function parseRateText(str) {
    if (str == null) return null;
    const cleaned = String(str).replace(/\/s\s*$/, "").trim();
    return parseNumber(cleaned);
  }

  // src/dom-reader.js
  var SELECTORS = {
    controlPanel: "control-panel",
    troopRateBadge: [
      "control-panel .border-green-400 span.tabular-nums",
      "control-panel .border-orange-400 span.tabular-nums"
    ],
    goldBadge: "control-panel .border-yellow-400 span.tabular-nums",
    troopBarOrange: "control-panel .bg-sky-600",
    attackSlider: 'control-panel input[type="range"]'
  };
  function queryFirst(selectors) {
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of arr) {
      try {
        const el3 = document.querySelector(sel);
        if (el3) return el3;
      } catch {
      }
    }
    return null;
  }
  function parseTroopsFromBar() {
    const overlays = document.querySelectorAll("control-panel .absolute.inset-0");
    for (const overlay of overlays) {
      const spans = overlay.querySelectorAll("span span");
      if (spans.length < 2) continue;
      const texts = [];
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && text !== "/" && !text.includes("svg")) {
          texts.push(text);
        }
      }
      if (texts.length >= 2) {
        return parseTroopText(texts[0], texts[1]);
      }
    }
    return null;
  }
  function parseAttackingPercent() {
    const el3 = queryFirst(SELECTORS.troopBarOrange);
    if (!el3) return 0;
    const width = el3.style.width;
    if (!width) return 0;
    return parseFloat(width) / 100;
  }
  function readGameState() {
    const panel = document.querySelector(SELECTORS.controlPanel);
    if (!panel) return null;
    const outerDiv = panel.querySelector(":scope > div");
    if (!outerDiv) return null;
    const troops = parseTroopsFromBar();
    if (!troops) return null;
    const rateEl = queryFirst(SELECTORS.troopRateBadge);
    const troopRate = rateEl ? parseRateText(rateEl.textContent) : null;
    const goldEl = queryFirst(SELECTORS.goldBadge);
    const gold = goldEl ? parseNumber(goldEl.textContent) : null;
    const slider = queryFirst(SELECTORS.attackSlider);
    const attackRatio = slider ? parseInt(slider.value, 10) / 100 : null;
    const attackingPercent = parseAttackingPercent();
    const attackingTroops = Math.round(troops.max * attackingPercent);
    const state = {
      currentTroops: troops.current,
      maxTroops: troops.max,
      troopRate: troopRate ?? 0,
      attackRatio: attackRatio ?? 0.2,
      gold: gold ?? 0,
      attackingTroops,
      ratio: troops.max > 0 ? troops.current / troops.max : 0,
      gameActive: true
    };
    if (!validateState(state)) return null;
    return state;
  }
  function validateState(state) {
    if (state.currentTroops < 0) return false;
    if (state.maxTroops <= 0) return false;
    if (state.currentTroops > state.maxTroops * 1.1) return false;
    if (state.attackRatio < 0 || state.attackRatio > 1) return false;
    return true;
  }

  // src/calculator.js
  var OPTIMAL_RATIO = 0.42;
  function growthPerTick(current, max) {
    if (current >= max || max <= 0) return 0;
    return (10 + Math.pow(current, 0.73) / 4) * (1 - current / max);
  }
  function growthPerSecond(current, max) {
    return growthPerTick(current, max) * 10;
  }
  function maxGrowthPerSecond(max) {
    return growthPerSecond(max * OPTIMAL_RATIO, max);
  }
  function efficiency(current, max) {
    const maxRate = maxGrowthPerSecond(max);
    if (maxRate <= 0) return 0;
    return growthPerSecond(current, max) / maxRate * 100;
  }
  function optimalTroops(max) {
    return Math.round(max * OPTIMAL_RATIO);
  }
  var RATIO_COLORS = [
    { max: 0.2, color: "#ef4444" },
    { max: 0.38, color: "#84cc16" },
    { max: 0.46, color: "#22c55e" },
    { max: 0.6, color: "#f59e0b" },
    { max: 0.85, color: "#f97316" },
    { max: Infinity, color: "#ef4444" }
  ];
  function getRatioColor(ratio) {
    for (const { max, color } of RATIO_COLORS) {
      if (ratio < max) return color;
    }
    return "#ef4444";
  }
  function getRecommendation(ratio, attackingTroops, current) {
    const isAttacking = attackingTroops > 0;
    if (ratio > 0.85) {
      return { text: "Dringend angreifen! Wachstum fast 0.", urgency: "high", color: "#ef4444" };
    }
    if (ratio > 0.6) {
      return {
        text: isAttacking ? "Gut \u2013 Angriff l\xE4uft, Truppen sinken." : "\xDCber Optimum. Angriff starten!",
        urgency: "medium",
        color: "#f97316"
      };
    }
    if (ratio > 0.46) {
      return { text: "Leicht \xFCber Optimum. Guter Angriffszeitpunkt.", urgency: "medium", color: "#f59e0b" };
    }
    if (ratio >= 0.38) {
      return { text: "Optimaler Bereich! Maximales Wachstum.", urgency: "low", color: "#22c55e" };
    }
    if (ratio >= 0.2) {
      return {
        text: isAttacking ? "Vorsicht \u2013 Truppen niedrig, Angriff bindet Ressourcen." : "Unter Optimum. Wachsen lassen.",
        urgency: "low",
        color: "#84cc16"
      };
    }
    return { text: "Kritisch niedrig. Nicht angreifen!", urgency: "high", color: "#ef4444" };
  }

  // src/history.js
  var TroopHistory = class {
    constructor(maxEntries = 120) {
      this.entries = [];
      this.maxEntries = maxEntries;
    }
    push(current, max, timestamp) {
      this.entries.push({
        current,
        max,
        ratio: max > 0 ? current / max : 0,
        timestamp
      });
      if (this.entries.length > this.maxEntries) {
        this.entries.shift();
      }
    }
    getTrend() {
      if (this.entries.length < 20) return "unknown";
      const recent = this.entries.slice(-10);
      const older = this.entries.slice(-20, -10);
      const avg = (arr) => arr.reduce((s, e) => s + e.ratio, 0) / arr.length;
      const diff = avg(recent) - avg(older);
      if (diff > 0.02) return "rising";
      if (diff < -0.02) return "falling";
      return "stable";
    }
    getChartData() {
      return this.entries.map((e) => ({
        ratio: Math.round(e.ratio * 100),
        ts: e.timestamp
      }));
    }
    reset() {
      this.entries = [];
    }
  };

  // src/settings.js
  var DEFAULTS = {
    minimized: false,
    showChart: true,
    compactMode: false,
    opacity: 0.92,
    hotkey: "F2",
    advisorVisible: true,
    advisorMinimized: false,
    advisorHotkey: "F3"
  };
  function loadSettings() {
    const settings = { ...DEFAULTS };
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      try {
        const stored = typeof GM_getValue === "function" ? GM_getValue("ofc_" + key, defaultVal) : JSON.parse(localStorage.getItem("ofc_" + key) ?? "null") ?? defaultVal;
        settings[key] = stored;
      } catch {
        settings[key] = defaultVal;
      }
    }
    return settings;
  }
  function saveSetting(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue("ofc_" + key, value);
      } else {
        localStorage.setItem("ofc_" + key, JSON.stringify(value));
      }
    } catch {
    }
  }

  // src/format.js
  function formatDisplayNumber(n) {
    n = Math.max(0, Math.round(n));
    if (n >= 1e7) return (Math.floor(n / 1e5) / 10).toFixed(1) + "M";
    if (n >= 1e6) return (Math.floor(n / 1e4) / 100).toFixed(2) + "M";
    if (n >= 1e5) return Math.floor(n / 1e3) + "K";
    if (n >= 1e4) return (Math.floor(n / 100) / 10).toFixed(1) + "K";
    if (n >= 1e3) return (Math.floor(n / 10) / 100).toFixed(2) + "K";
    return n.toString();
  }

  // src/renderer.js
  var PANEL_ID = "ofc-companion-panel";
  var STYLES = `
#${PANEL_ID} {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 280px;
  z-index: 9990;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: #e5e5e5;
  pointer-events: auto;
  user-select: none;
}
#${PANEL_ID} .ofc-panel {
  background: rgba(17, 17, 17, 0.92);
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}
#${PANEL_ID} .ofc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 1px solid #2a2a2a;
  cursor: default;
}
#${PANEL_ID} .ofc-header-title {
  font-weight: 700;
  font-size: 13px;
}
#${PANEL_ID} .ofc-header-btns button {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}
#${PANEL_ID} .ofc-header-btns button:hover {
  color: #fff;
}
#${PANEL_ID} .ofc-body {
  padding: 8px 10px;
}
#${PANEL_ID} .ofc-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 0;
}
#${PANEL_ID} .ofc-label {
  color: #888;
  font-size: 11px;
}
#${PANEL_ID} .ofc-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
#${PANEL_ID} .ofc-bar-track {
  width: 100%;
  height: 14px;
  background: #1a1a1a;
  border-radius: 4px;
  overflow: hidden;
  margin: 4px 0;
  position: relative;
}
#${PANEL_ID} .ofc-bar-fill {
  height: 100%;
  transition: width 0.5s ease, background-color 0.3s;
  border-radius: 4px 0 0 4px;
}
#${PANEL_ID} .ofc-bar-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  opacity: 0.6;
  left: 42%;
}
#${PANEL_ID} .ofc-recommendation {
  padding: 5px 8px;
  margin-top: 4px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  transition: background-color 0.3s, color 0.3s;
}
#${PANEL_ID} .ofc-minimized {
  padding: 4px 10px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
#${PANEL_ID}.ofc-hidden {
  display: none;
}
`;
  var panelEl = null;
  var isMinimized = false;
  function el(tag, className, textContent) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (textContent != null) e.textContent = textContent;
    return e;
  }
  function field(tag, className, fieldName, textContent) {
    const e = el(tag, className, textContent);
    e.dataset.field = fieldName;
    return e;
  }
  function buildRow(label, fieldName) {
    const row = el("div", "ofc-row");
    row.appendChild(el("span", "ofc-label", label));
    row.appendChild(field("span", "ofc-value", fieldName, "-"));
    return row;
  }
  function buildPanelDOM() {
    const root = el("div", "ofc-panel");
    const header = el("div", "ofc-header");
    header.appendChild(el("span", "ofc-header-title", "OpenFront Companion"));
    const btns = el("span", "ofc-header-btns");
    const minBtn = el("button", "ofc-btn-minimize", "\u2212");
    minBtn.title = "Minimize";
    btns.appendChild(minBtn);
    const closeBtn = el("button", "ofc-btn-close", "\xD7");
    closeBtn.title = "Close";
    btns.appendChild(closeBtn);
    header.appendChild(btns);
    root.appendChild(header);
    const body = el("div", "ofc-body");
    body.appendChild(buildRow("Truppen", "troops"));
    const barTrack = el("div", "ofc-bar-track");
    const barFill = field("div", "ofc-bar-fill", "bar");
    barFill.style.width = "0%";
    barFill.style.backgroundColor = "#22c55e";
    barTrack.appendChild(barFill);
    barTrack.appendChild(el("div", "ofc-bar-marker"));
    body.appendChild(barTrack);
    body.appendChild(buildRow("Wachstum", "growth"));
    body.appendChild(buildRow("Optimum", "optimal"));
    body.appendChild(buildRow("Im Angriff", "attacking"));
    body.appendChild(buildRow("Shield", "shield"));
    body.appendChild(field("div", "ofc-recommendation", "recommendation", "-"));
    root.appendChild(body);
    const minView = field("div", "ofc-minimized", "minimized-view", "-");
    minView.style.display = "none";
    root.appendChild(minView);
    return root;
  }
  function createOverlay(settings) {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(STYLES);
    } else {
      const style = document.createElement("style");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    isMinimized = settings.minimized ?? false;
    const wrapper = document.createElement("div");
    wrapper.id = PANEL_ID;
    wrapper.appendChild(buildPanelDOM());
    document.body.appendChild(wrapper);
    panelEl = wrapper;
    wrapper.querySelector(".ofc-btn-minimize")?.addEventListener("click", toggleMinimize);
    wrapper.querySelector(".ofc-btn-close")?.addEventListener("click", () => setVisible(false));
    wrapper.querySelector(".ofc-minimized")?.addEventListener("click", toggleMinimize);
    if (isMinimized) applyMinimized();
    return wrapper;
  }
  function updateOverlay(stats) {
    if (!panelEl) return;
    const minView = panelEl.querySelector('[data-field="minimized-view"]');
    if (minView) {
      minView.textContent = "\u2694 " + stats.ratioPercent.toFixed(0) + "%";
      minView.style.color = stats.ratioColor;
    }
    if (isMinimized) return;
    const fmt = formatDisplayNumber;
    setText(
      "troops",
      fmt(stats.currentTroops) + " / " + fmt(stats.maxTroops) + "  (" + stats.ratioPercent.toFixed(1) + "%)"
    );
    setColor("troops", stats.ratioColor);
    const bar = panelEl.querySelector('[data-field="bar"]');
    if (bar) {
      bar.style.width = Math.min(stats.ratioPercent, 100) + "%";
      bar.style.backgroundColor = stats.ratioColor;
    }
    setText(
      "growth",
      "+" + fmt(stats.troopRate) + "/s   (" + stats.efficiencyPercent.toFixed(0) + "% Eff.)"
    );
    const timeStr = stats.timeToOptimal === 0 ? "erreicht" : stats.timeToOptimal === Infinity ? "-" : "in ~" + stats.timeToOptimal.toFixed(1) + "s";
    setText("optimal", fmt(stats.optimalTroops) + "      " + timeStr);
    const atkPct = stats.maxTroops > 0 ? (stats.attackingTroops / stats.maxTroops * 100).toFixed(1) : "0.0";
    setText("attacking", fmt(stats.attackingTroops) + "      (" + atkPct + "%)");
    const shieldPct = stats.maxTroops > 0 ? (stats.defendingTroops / stats.maxTroops * 100).toFixed(1) : "0.0";
    setText("shield", fmt(stats.defendingTroops) + "      (" + shieldPct + "%)");
    const rec = panelEl.querySelector('[data-field="recommendation"]');
    if (rec) {
      rec.textContent = stats.recommendation.text;
      rec.style.backgroundColor = stats.recommendation.color + "22";
      rec.style.color = stats.recommendation.color;
    }
  }
  function setText(fieldName, text) {
    const el3 = panelEl?.querySelector('[data-field="' + fieldName + '"]');
    if (el3) el3.textContent = text;
  }
  function setColor(fieldName, color) {
    const el3 = panelEl?.querySelector('[data-field="' + fieldName + '"]');
    if (el3) el3.style.color = color;
  }
  function toggleMinimize() {
    isMinimized = !isMinimized;
    applyMinimized();
    saveSetting("minimized", isMinimized);
    return isMinimized;
  }
  function applyMinimized() {
    if (!panelEl) return;
    const body = panelEl.querySelector(".ofc-body");
    const header = panelEl.querySelector(".ofc-header");
    const minView = panelEl.querySelector('[data-field="minimized-view"]');
    if (body) body.style.display = isMinimized ? "none" : "";
    if (header) header.style.display = isMinimized ? "none" : "";
    if (minView) minView.style.display = isMinimized ? "" : "none";
  }
  function setVisible(visible) {
    if (panelEl) panelEl.classList.toggle("ofc-hidden", !visible);
  }

  // src/game-api.js
  var GAME_ELEMENT_SELECTORS = ["leader-board", "control-panel", "player-info-overlay"];
  var BORDER_CACHE_TTL = 1e4;
  var cachedGameView = null;
  var borderCache = { players: [], timestamp: 0 };
  var UNIT_TYPES = {
    City: "City",
    Factory: "Factory",
    Port: "Port",
    MissileSilo: "MissileSilo",
    SAMLauncher: "SAMLauncher"
  };
  function getGameView() {
    if (cachedGameView) return cachedGameView;
    for (const sel of GAME_ELEMENT_SELECTORS) {
      try {
        const el3 = document.querySelector(sel);
        if (el3 && el3.game) {
          cachedGameView = el3.game;
          return cachedGameView;
        }
      } catch {
      }
    }
    return null;
  }
  function getMyPlayer() {
    const game = getGameView();
    if (!game) return null;
    try {
      const p = game.myPlayer();
      return p && p.isAlive() ? p : null;
    } catch {
      return null;
    }
  }
  function getAllPlayers() {
    const game = getGameView();
    const me = getMyPlayer();
    if (!game || !me) return [];
    try {
      return game.playerViews().filter((p) => p.isAlive() && p.id() !== me.id());
    } catch {
      return [];
    }
  }
  function getPlayerData(player) {
    const game = getGameView();
    const me = getMyPlayer();
    if (!game || !me) return null;
    try {
      return _extractPlayerData(player, me, game);
    } catch {
      return null;
    }
  }
  function _extractPlayerData(player, myPlayer, game) {
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
      territoryPercent: totalLand > 0 ? territory / totalLand * 100 : 0,
      gold: player.gold(),
      buildings: {
        cities: player.totalUnitLevels(UNIT_TYPES.City),
        factories: player.totalUnitLevels(UNIT_TYPES.Factory),
        ports: player.totalUnitLevels(UNIT_TYPES.Port),
        silos: player.totalUnitLevels(UNIT_TYPES.MissileSilo),
        sams: player.totalUnitLevels(UNIT_TYPES.SAMLauncher)
      },
      outgoingAttacks: _sumAttacks(player.outgoingAttacks()),
      incomingAttacks: _sumAttacks(player.incomingAttacks()),
      isFriendly: player.isFriendly(myPlayer),
      isAlive: player.isAlive()
    };
  }
  function _sumAttacks(attacks) {
    let sum = 0;
    for (const a of attacks) {
      if (!a.retreating) sum += a.troops;
    }
    return sum;
  }
  async function getBorderingPlayers() {
    const now = Date.now();
    if (now - borderCache.timestamp < BORDER_CACHE_TTL && borderCache.players.length > 0) {
      return borderCache.players;
    }
    const game = getGameView();
    const me = getMyPlayer();
    if (!game || !me) return getAllPlayers();
    try {
      const borderData = await me.borderTiles();
      const borderTiles = borderData.borderTiles;
      const neighborIds = /* @__PURE__ */ new Set();
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
      return getAllPlayers();
    }
  }
  function invalidateBorderCache() {
    borderCache.timestamp = 0;
  }

  // src/attack-advisor.js
  function getRating(score) {
    if (score >= 70) return { label: "STRIKE", color: "#22c55e" };
    if (score >= 40) return { label: "RISKY", color: "#f59e0b" };
    return { label: "AVOID", color: "#ef4444" };
  }
  function scoreTarget(myData, enemy) {
    if (enemy.isFriendly || !enemy.isAlive) return { score: -1 };
    const enemyDefending = Math.max(0, enemy.troops - enemy.outgoingAttacks);
    let vulnerability = (1 - enemy.troopRatio) * 25;
    if (enemy.outgoingAttacks > 0) vulnerability += 10;
    if (enemy.incomingAttacks > 0) vulnerability += 5;
    vulnerability = Math.min(vulnerability, 40);
    let strategic = Math.min(enemy.territoryPercent * 2, 15);
    if (enemy.buildings.cities > 0) strategic += 5;
    if (enemy.gold > 5e5) strategic += 5;
    if (enemy.territoryPercent > 15) strategic += 5;
    strategic = Math.min(strategic, 30);
    const ratio = enemyDefending > 0 ? myData.troops / enemyDefending : 100;
    let feasibility = 0;
    if (ratio >= 3) feasibility = 30;
    else if (ratio >= 2) feasibility = 20;
    else if (ratio >= 1.5) feasibility = 10;
    let score = vulnerability + strategic + feasibility;
    if (String(enemy.type) === "Bot") score += 10;
    if (enemy.territory > 15e4) {
      const debuffBonus = Math.min(15, Math.max(5, (enemy.territory - 15e4) / 2e4));
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
    const attackRatio = myData.troops > 0 ? Math.round(recommended / myData.troops * 100) : 0;
    const advantage = enemyDefending > 0 ? (recommended / enemyDefending).toFixed(1) + ":1" : "---";
    const troopsAfter = myData.troops - recommended;
    const optimal = optimalTroops(myData.maxTroops);
    let recoveryTime = 0;
    if (troopsAfter < optimal) {
      const rate = growthPerSecond(troopsAfter, myData.maxTroops);
      recoveryTime = rate > 0 ? (optimal - troopsAfter) / rate : Infinity;
    }
    return { recommended, attackRatio, advantage, recoveryTime };
  }
  function getAdvisorData(myData, enemyDataList) {
    const scored = enemyDataList.map((enemy) => {
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
        ...rec
      };
    }).filter((t) => t !== null).sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      targets: scored,
      myTroops: myData.troops,
      myMaxTroops: myData.maxTroops,
      lastUpdated: Date.now()
    };
  }

  // src/advisor-renderer.js
  var PANEL_ID2 = "ofc-advisor-panel";
  var ADVISOR_STYLES = `
#${PANEL_ID2} {
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
#${PANEL_ID2} .ofc-adv-panel {
  background: rgba(17, 17, 17, 0.92);
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}
#${PANEL_ID2} .ofc-adv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 1px solid #2a2a2a;
  cursor: default;
}
#${PANEL_ID2} .ofc-adv-header-title {
  font-weight: 700;
  font-size: 13px;
}
#${PANEL_ID2} .ofc-adv-header-btns button {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}
#${PANEL_ID2} .ofc-adv-header-btns button:hover { color: #fff; }
#${PANEL_ID2} .ofc-adv-body { padding: 4px 0; }
#${PANEL_ID2} .ofc-adv-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  cursor: pointer;
  transition: background-color 0.15s;
}
#${PANEL_ID2} .ofc-adv-row:hover { background: rgba(255,255,255,0.05); }
#${PANEL_ID2} .ofc-adv-row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
#${PANEL_ID2} .ofc-adv-row-troops {
  font-size: 10px;
  color: #888;
  margin: 0 8px;
  white-space: nowrap;
}
#${PANEL_ID2} .ofc-adv-row-rating {
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
#${PANEL_ID2} .ofc-adv-detail {
  background: #1a1a1a;
  margin: 0 6px 4px 6px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 10px;
  color: #ccc;
  display: none;
}
#${PANEL_ID2} .ofc-adv-detail.ofc-adv-open { display: block; }
#${PANEL_ID2} .ofc-adv-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}
#${PANEL_ID2} .ofc-adv-detail-label { color: #888; }
#${PANEL_ID2} .ofc-adv-detail-sep {
  border-top: 1px solid #2a2a2a;
  margin: 4px 0;
}
#${PANEL_ID2} .ofc-adv-rec { font-weight: 600; }
#${PANEL_ID2} .ofc-adv-empty {
  padding: 8px 10px;
  color: #666;
  font-size: 11px;
}
#${PANEL_ID2} .ofc-adv-minimized {
  padding: 4px 10px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  display: none;
}
#${PANEL_ID2}.ofc-hidden { display: none; }
`;
  var panelEl2 = null;
  var isMinimized2 = false;
  var expandedIndex = -1;
  function el2(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function buildPanel() {
    const root = el2("div", "ofc-adv-panel");
    const header = el2("div", "ofc-adv-header");
    header.appendChild(el2("span", "ofc-adv-header-title", "Attack Advisor"));
    const btns = el2("span", "ofc-adv-header-btns");
    const minBtn = el2("button", null, "\u2212");
    minBtn.title = "Minimize";
    btns.appendChild(minBtn);
    const closeBtn = el2("button", null, "\xD7");
    closeBtn.title = "Close";
    btns.appendChild(closeBtn);
    header.appendChild(btns);
    root.appendChild(header);
    const body = el2("div", "ofc-adv-body");
    body.dataset.field = "advisor-body";
    root.appendChild(body);
    const minView = el2("div", "ofc-adv-minimized");
    minView.dataset.field = "advisor-min";
    root.appendChild(minView);
    return { root, minBtn, closeBtn, body, minView };
  }
  function createAdvisorPanel(settings) {
    if (typeof GM_addStyle === "function") {
      GM_addStyle(ADVISOR_STYLES);
    } else {
      const style = document.createElement("style");
      style.textContent = ADVISOR_STYLES;
      document.head.appendChild(style);
    }
    isMinimized2 = settings.advisorMinimized ?? false;
    expandedIndex = -1;
    const wrapper = document.createElement("div");
    wrapper.id = PANEL_ID2;
    const { root, minBtn, closeBtn, minView } = buildPanel();
    wrapper.appendChild(root);
    document.body.appendChild(wrapper);
    panelEl2 = wrapper;
    minBtn.addEventListener("click", toggleAdvisorMinimize);
    closeBtn.addEventListener("click", () => setAdvisorVisible(false));
    minView.addEventListener("click", toggleAdvisorMinimize);
    if (isMinimized2) applyMinimized2();
    positionBelowCompanion();
    return wrapper;
  }
  function positionBelowCompanion() {
    if (!panelEl2) return;
    const companion = document.getElementById("ofc-companion-panel");
    if (companion) {
      const rect = companion.getBoundingClientRect();
      panelEl2.style.top = rect.bottom + 8 + "px";
      panelEl2.style.right = "10px";
    }
  }
  function updateAdvisorPanel(result) {
    if (!panelEl2) return;
    positionBelowCompanion();
    const minView = panelEl2.querySelector('[data-field="advisor-min"]');
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
    if (isMinimized2) return;
    const body = panelEl2.querySelector('[data-field="advisor-body"]');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (result.targets.length === 0) {
      body.appendChild(el2("div", "ofc-adv-empty", "No targets in range"));
      return;
    }
    const fmt = formatDisplayNumber;
    result.targets.forEach((target, i) => {
      const row = el2("div", "ofc-adv-row");
      const nameSpan = el2("span", "ofc-adv-row-name", target.name);
      nameSpan.style.color = target.ratingColor;
      row.appendChild(nameSpan);
      row.appendChild(el2(
        "span",
        "ofc-adv-row-troops",
        fmt(target.troops) + "/" + fmt(target.maxTroops)
      ));
      const ratingSpan = el2("span", "ofc-adv-row-rating", target.rating);
      ratingSpan.style.color = target.ratingColor;
      row.appendChild(ratingSpan);
      const detail = el2("div", "ofc-adv-detail");
      if (i === expandedIndex) detail.classList.add("ofc-adv-open");
      const addDetailRow = (label, value) => {
        const r = el2("div", "ofc-adv-detail-row");
        r.appendChild(el2("span", "ofc-adv-detail-label", label));
        r.appendChild(el2("span", null, value));
        detail.appendChild(r);
      };
      addDetailRow("Troops", fmt(target.troops) + " / " + fmt(target.maxTroops) + " (" + (target.troopRatio * 100).toFixed(0) + "%)");
      addDetailRow("Territory", target.territoryPercent.toFixed(1) + "%");
      addDetailRow("Gold", fmt(target.gold));
      addDetailRow(
        "Buildings",
        "C:" + target.buildings.cities + " S:" + target.buildings.silos + " SAM:" + target.buildings.sams
      );
      addDetailRow("Status", target.status);
      detail.appendChild(el2("div", "ofc-adv-detail-sep"));
      const recText = "Send " + fmt(target.recommended) + " (" + target.attackRatio + "%) \u2014 " + target.advantage;
      const recEl = el2("div", "ofc-adv-rec", recText);
      recEl.style.color = target.ratingColor;
      detail.appendChild(recEl);
      const recTime = target.recoveryTime === Infinity ? "Recovery: ---" : target.recoveryTime === 0 ? "Recovery: instant" : "Recovery: ~" + target.recoveryTime.toFixed(0) + "s to optimal";
      detail.appendChild(el2("div", "ofc-adv-detail-label", recTime));
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
  function toggleAdvisorMinimize() {
    isMinimized2 = !isMinimized2;
    applyMinimized2();
    saveSetting("advisorMinimized", isMinimized2);
    return isMinimized2;
  }
  function applyMinimized2() {
    if (!panelEl2) return;
    const body = panelEl2.querySelector(".ofc-adv-body");
    const header = panelEl2.querySelector(".ofc-adv-header");
    const minView = panelEl2.querySelector('[data-field="advisor-min"]');
    if (body) body.style.display = isMinimized2 ? "none" : "";
    if (header) header.style.display = isMinimized2 ? "none" : "";
    if (minView) minView.style.display = isMinimized2 ? "" : "none";
  }
  function setAdvisorVisible(visible) {
    if (panelEl2) panelEl2.classList.toggle("ofc-hidden", !visible);
  }

  // src/main.js
  var POLL_INTERVAL = 500;
  var MAX_CONSECUTIVE_ERRORS = 10;
  var intervalId = null;
  var history = new TroopHistory(120);
  var consecutiveErrors = 0;
  var cachedHotkey = "F2";
  var advisorIntervalId = null;
  var cachedAdvisorHotkey = "F3";
  var lastAdvisorTroops = 0;
  var consecutiveAdvisorErrors = 0;
  var ADVISOR_INTERVAL = 3e3;
  var ADVISOR_MAX_ERRORS = 5;
  var TROOP_CHANGE_THRESHOLD = 0.1;
  function waitForGame() {
    return new Promise((resolve) => {
      if (document.querySelector("control-panel")) {
        resolve();
        return;
      }
      const observer = new MutationObserver(() => {
        if (document.querySelector("control-panel")) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
  function calculateStats(state) {
    const internalCurrent = state.currentTroops * 10;
    const internalMax = state.maxTroops * 10;
    const eff = efficiency(internalCurrent, internalMax);
    const optimal = optimalTroops(state.maxTroops);
    const defending = Math.max(0, state.currentTroops - state.attackingTroops);
    const tto = state.currentTroops >= optimal ? 0 : state.troopRate > 0 ? (optimal - state.currentTroops) / state.troopRate : Infinity;
    const recommendation = getRecommendation(
      state.ratio,
      state.attackingTroops,
      state.currentTroops
    );
    return {
      currentTroops: state.currentTroops,
      maxTroops: state.maxTroops,
      ratio: state.ratio,
      ratioPercent: state.ratio * 100,
      troopRate: state.troopRate,
      efficiencyPercent: eff,
      optimalTroops: optimal,
      timeToOptimal: tto,
      attackingTroops: state.attackingTroops,
      defendingTroops: defending,
      recommendation,
      ratioColor: getRatioColor(state.ratio)
    };
  }
  function tick() {
    const state = readGameState();
    if (!state) {
      consecutiveErrors++;
      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
        setVisible(false);
        console.warn("[OF-Companion] Too many read errors, hiding overlay.");
      }
      return;
    }
    consecutiveErrors = 0;
    setVisible(true);
    history.push(state.currentTroops, state.maxTroops, Date.now());
    const stats = calculateStats(state);
    updateOverlay(stats);
    checkTroopChange(state.currentTroops);
  }
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
      const myTroops = me.troops();
      const myMaxTroops = game.config().maxTroops(me);
      const myData = { troops: myTroops, maxTroops: myMaxTroops };
      const neighbors = await getBorderingPlayers();
      const enemyDataList = neighbors.map((p) => getPlayerData(p)).filter((d) => d !== null);
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
  function startLoop() {
    if (intervalId) return;
    intervalId = setInterval(tick, POLL_INTERVAL);
    console.log("[OF-Companion] Started polling every " + POLL_INTERVAL + "ms");
  }
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
  async function init() {
    console.log("[OF-Companion] Waiting for game...");
    await waitForGame();
    console.log("[OF-Companion] Game detected, initializing.");
    const settings = loadSettings();
    cachedHotkey = settings.hotkey;
    createOverlay(settings);
    document.addEventListener("keydown", handleHotkey);
    startLoop();
    cachedAdvisorHotkey = settings.advisorHotkey;
    const game = getGameView();
    if (game) {
      createAdvisorPanel(settings);
      startAdvisorLoop();
    } else {
      console.log("[OF-Companion] GameView not available, advisor disabled.");
    }
  }
  init().catch((err) => console.error("[OF-Companion] Init failed:", err));
})();
