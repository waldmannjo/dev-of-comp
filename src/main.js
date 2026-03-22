// src/main.js
import { readGameState } from "./dom-reader.js";
import {
  efficiency,
  optimalTroops,
  getRecommendation,
  getRatioColor,
} from "./calculator.js";
import { TroopHistory } from "./history.js";
import {
  createOverlay,
  updateOverlay,
  setVisible,
  toggleMinimize,
} from "./renderer.js";
import { loadSettings } from "./settings.js";

const POLL_INTERVAL = 500;
const MAX_CONSECUTIVE_ERRORS = 10;

let intervalId = null;
const history = new TroopHistory(120);
let consecutiveErrors = 0;

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

  const tto = state.currentTroops >= optimal
    ? 0
    : state.troopRate > 0
      ? (optimal - state.currentTroops) / state.troopRate
      : Infinity;

  const recommendation = getRecommendation(
    state.ratio, state.attackingTroops, state.currentTroops
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
    ratioColor: getRatioColor(state.ratio),
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
  const settings = loadSettings();
  if (e.key === settings.hotkey) {
    toggleMinimize();
    e.preventDefault();
  }
}

async function init() {
  console.log("[OF-Companion] Waiting for game...");
  await waitForGame();
  console.log("[OF-Companion] Game detected, initializing.");

  const settings = loadSettings();
  createOverlay(settings);
  document.addEventListener("keydown", handleHotkey);
  startLoop();
}

init().catch((err) => console.error("[OF-Companion] Init failed:", err));
