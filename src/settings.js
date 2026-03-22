// src/settings.js

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

export function loadSettings() {
  const settings = { ...DEFAULTS };
  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    try {
      const stored =
        typeof GM_getValue === "function"
          ? GM_getValue("ofc_" + key, defaultVal)
          : JSON.parse(localStorage.getItem("ofc_" + key) ?? "null") ?? defaultVal;
      settings[key] = stored;
    } catch {
      settings[key] = defaultVal;
    }
  }
  return settings;
}

export function saveSetting(key, value) {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue("ofc_" + key, value);
    } else {
      localStorage.setItem("ofc_" + key, JSON.stringify(value));
    }
  } catch {
    // silently fail in restricted contexts
  }
}
