// src/history.js

export class TroopHistory {
  constructor(maxEntries = 120) {
    this.entries = [];
    this.maxEntries = maxEntries;
  }

  push(current, max, timestamp) {
    this.entries.push({
      current,
      max,
      ratio: max > 0 ? current / max : 0,
      timestamp,
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
      ts: e.timestamp,
    }));
  }

  reset() {
    this.entries = [];
  }
}
