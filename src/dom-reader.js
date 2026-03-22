// src/dom-reader.js
import { parseNumber, parseTroopText, parseRateText, parseAttackRatioText } from "./parser.js";

const SELECTORS = {
  controlPanel: "control-panel",
  troopRateBadge: [
    "control-panel .border-green-400 span.tabular-nums",
    "control-panel .border-orange-400 span.tabular-nums",
  ],
  goldBadge: "control-panel .border-yellow-400 span.tabular-nums",
  troopBarGreen: "control-panel .bg-sky-700",
  troopBarOrange: "control-panel .bg-sky-600",
  attackSlider: 'control-panel input[type="range"]',
  attackLabel: "control-panel .border-gray-600 span",
};

function queryFirst(selectors) {
  const arr = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of arr) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* invalid selector, skip */ }
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
  const el = queryFirst(SELECTORS.troopBarOrange);
  if (!el) return 0;
  const width = el.style.width;
  if (!width) return 0;
  return parseFloat(width) / 100;
}

export function readGameState() {
  const panel = document.querySelector(SELECTORS.controlPanel);
  if (!panel) return null;

  const outerDiv = panel.querySelector(":scope > div");
  if (!outerDiv || outerDiv.classList.contains("hidden")) return null;

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
    gameActive: true,
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
