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
  body.appendChild(el("div", "ofc-adv-empty", "Waiting for game data..."));
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
