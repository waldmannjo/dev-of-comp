// src/renderer.js
import { getRatioColor } from "./calculator.js";
import { saveSetting } from "./settings.js";

const PANEL_ID = "ofc-companion-panel";

/** CSS styles injected via GM_addStyle or <style> tag. */
export const STYLES = `
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

let panelEl = null;
let isMinimized = false;

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
  const closeBtn = el("button", "ofc-btn-close", "\u00d7");
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

export function createOverlay(settings) {
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

export function updateOverlay(stats) {
  if (!panelEl) return;

  const minView = panelEl.querySelector('[data-field="minimized-view"]');
  if (minView) {
    minView.textContent = "\u2694 " + stats.ratioPercent.toFixed(0) + "%";
    minView.style.color = stats.ratioColor;
  }

  if (isMinimized) return;

  const fmt = formatDisplayNumber;

  setText("troops",
    fmt(stats.currentTroops) + " / " + fmt(stats.maxTroops) + "  (" + stats.ratioPercent.toFixed(1) + "%)");
  setColor("troops", stats.ratioColor);

  const bar = panelEl.querySelector('[data-field="bar"]');
  if (bar) {
    bar.style.width = Math.min(stats.ratioPercent, 100) + "%";
    bar.style.backgroundColor = stats.ratioColor;
  }

  setText("growth",
    "+" + fmt(stats.troopRate) + "/s   (" + stats.efficiencyPercent.toFixed(0) + "% Eff.)");

  const timeStr = stats.timeToOptimal === 0
    ? "erreicht"
    : stats.timeToOptimal === Infinity
      ? "-"
      : "in ~" + stats.timeToOptimal.toFixed(1) + "s";
  setText("optimal", fmt(stats.optimalTroops) + "      " + timeStr);

  const atkPct = stats.maxTroops > 0
    ? ((stats.attackingTroops / stats.maxTroops) * 100).toFixed(1)
    : "0.0";
  setText("attacking", fmt(stats.attackingTroops) + "      (" + atkPct + "%)");

  const shieldPct = stats.maxTroops > 0
    ? ((stats.defendingTroops / stats.maxTroops) * 100).toFixed(1)
    : "0.0";
  setText("shield", fmt(stats.defendingTroops) + "      (" + shieldPct + "%)");

  const rec = panelEl.querySelector('[data-field="recommendation"]');
  if (rec) {
    rec.textContent = stats.recommendation.text;
    rec.style.backgroundColor = stats.recommendation.color + "22";
    rec.style.color = stats.recommendation.color;
  }
}

function setText(fieldName, text) {
  const el = panelEl?.querySelector('[data-field="' + fieldName + '"]');
  if (el) el.textContent = text;
}

function setColor(fieldName, color) {
  const el = panelEl?.querySelector('[data-field="' + fieldName + '"]');
  if (el) el.style.color = color;
}

function formatDisplayNumber(n) {
  n = Math.max(0, Math.round(n));
  if (n >= 10_000_000) return (Math.floor(n / 100000) / 10).toFixed(1) + "M";
  if (n >= 1_000_000) return (Math.floor(n / 10000) / 100).toFixed(2) + "M";
  if (n >= 100_000) return Math.floor(n / 1000) + "K";
  if (n >= 10_000) return (Math.floor(n / 100) / 10).toFixed(1) + "K";
  if (n >= 1_000) return (Math.floor(n / 10) / 100).toFixed(2) + "K";
  return n.toString();
}

export function toggleMinimize() {
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

export function setVisible(visible) {
  if (panelEl) panelEl.classList.toggle("ofc-hidden", !visible);
}

export function destroyOverlay() {
  panelEl?.remove();
  panelEl = null;
}
