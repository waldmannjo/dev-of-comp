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
        const el2 = document.querySelector(sel);
        if (el2) return el2;
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
    const el2 = queryFirst(SELECTORS.troopBarOrange);
    if (!el2) return 0;
    const width = el2.style.width;
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
    hotkey: "F2"
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
    const el2 = panelEl?.querySelector('[data-field="' + fieldName + '"]');
    if (el2) el2.textContent = text;
  }
  function setColor(fieldName, color) {
    const el2 = panelEl?.querySelector('[data-field="' + fieldName + '"]');
    if (el2) el2.style.color = color;
  }
  function formatDisplayNumber(n) {
    n = Math.max(0, Math.round(n));
    if (n >= 1e7) return (Math.floor(n / 1e5) / 10).toFixed(1) + "M";
    if (n >= 1e6) return (Math.floor(n / 1e4) / 100).toFixed(2) + "M";
    if (n >= 1e5) return Math.floor(n / 1e3) + "K";
    if (n >= 1e4) return (Math.floor(n / 100) / 10).toFixed(1) + "K";
    if (n >= 1e3) return (Math.floor(n / 10) / 100).toFixed(2) + "K";
    return n.toString();
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

  // src/main.js
  var POLL_INTERVAL = 500;
  var MAX_CONSECUTIVE_ERRORS = 10;
  var intervalId = null;
  var history = new TroopHistory(120);
  var consecutiveErrors = 0;
  var cachedHotkey = "F2";
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
  }
  init().catch((err) => console.error("[OF-Companion] Init failed:", err));
})();
