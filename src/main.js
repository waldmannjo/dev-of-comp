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

const POLL_INTERVAL = 500;
const MAX_CONSECUTIVE_ERRORS = 10;

let intervalId = null;
const history = new TroopHistory(120);
let consecutiveErrors = 0;
let cachedHotkey = "F2";
let advisorIntervalId = null;
let cachedAdvisorHotkey = "F3";
let lastAdvisorTroops = 0;
let consecutiveAdvisorErrors = 0;
let consecutiveAdvisorUnavailable = 0;
const ADVISOR_INTERVAL = 3000;
const ADVISOR_MAX_ERRORS = 5;
const TROOP_CHANGE_THRESHOLD = 0.10;

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
  checkTroopChange(state.currentTroops);
}

async function advisorTick() {
  const game = getGameView();
  if (!game) {
    consecutiveAdvisorUnavailable++;
    if (consecutiveAdvisorUnavailable > ADVISOR_MAX_ERRORS) {
      setAdvisorVisible(false);
    }
    return;
  }

  const me = getMyPlayer();
  if (!me) {
    consecutiveAdvisorUnavailable++;
    if (consecutiveAdvisorUnavailable > ADVISOR_MAX_ERRORS) {
      setAdvisorVisible(false);
    }
    return;
  }

  try {
    // Read own data directly — avoid routing through getPlayerData
    // which calls isFriendly(myPlayer) on self (undefined behavior)
    const myTroops = Number(me.troops());
    const myMaxTroops = Number(game.config().maxTroops(me));
    const myData = { troops: myTroops, maxTroops: myMaxTroops };

    const neighbors = await getBorderingPlayers();
    const enemyDataList = neighbors
      .map(p => getPlayerData(p))
      .filter(d => d !== null);

    const result = getAdvisorData(myData, enemyDataList);
    updateAdvisorPanel(result);
    setAdvisorVisible(true);
    lastAdvisorTroops = myTroops;
    consecutiveAdvisorErrors = 0;
    consecutiveAdvisorUnavailable = 0;
  } catch (e) {
    consecutiveAdvisorErrors++;
    console.warn("[OF-Companion] Advisor tick error (" + consecutiveAdvisorErrors + "):", e);
    if (consecutiveAdvisorErrors > ADVISOR_MAX_ERRORS) {
      setAdvisorVisible(false);
      console.warn("[OF-Companion] Advisor: too many errors, hiding panel.");
    }
  }
}

function waitForGameView() {
  // The .game property is assigned by GameRenderer.createRenderer() when a game
  // actually starts — not when the control-panel element appears in the DOM.
  // The element exists in the lobby already, so we must keep polling until the
  // user enters a game (could be minutes).
  const poll = setInterval(() => {
    const g = getGameView();
    if (g) {
      clearInterval(poll);
      console.log("[OF-Companion] GameView found, starting advisor.");
      startAdvisorLoop();
    }
  }, 2000);
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
  createAdvisorPanel(settings);
  setAdvisorVisible(settings.advisorVisible !== false);
  document.addEventListener("keydown", handleHotkey);
  startLoop();
  cachedAdvisorHotkey = settings.advisorHotkey;
  waitForGameView();
}

init().catch((err) => console.error("[OF-Companion] Init failed:", err));
