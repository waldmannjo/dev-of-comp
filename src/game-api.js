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
