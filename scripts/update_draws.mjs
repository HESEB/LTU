// scripts/update_draws.mjs
// v4 (FINAL): Use a stable public JSON mirror to avoid dhlottery blocks on GitHub Actions.
// Primary source: https://smok95.github.io/lotto/results/all.json
// Fallback: keep existing data (never overwrite with empty).
// Output schema (used by Luck-to-you app):
//   [{ drwNo:Number, date:"YYYY-MM-DD", nums:[6 numbers sorted], bonus:Number }, ...]

import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.join(process.cwd(), "data", "lotto_draws.json");

// Public mirror (GitHub Pages) that serves all draws as JSON
const MIRROR_ALL = "https://smok95.github.io/lotto/results/all.json";

// Optional fallback: dhlottery API (may be blocked); kept here but not required
const DHL_API = (n) => `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${n}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadExisting() {
  if (!fs.existsSync(OUT_PATH)) return [];
  try {
    const raw = fs.readFileSync(OUT_PATH, "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function fetchJSON(url, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 lucktoyou-bot",
          "Accept": "application/json,text/plain,*/*",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        }
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      // Basic guard for HTML responses
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error(`Non-JSON response (starts '${text.trim().slice(0, 12)}')`);
      }
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr ?? new Error("fetchJSON failed");
}

function toYYYYMMDD(dateStr) {
  if (!dateStr) return "";
  // smok95 date is ISO like "2020-09-19T00:00:00Z"
  return String(dateStr).slice(0, 10);
}

function normalizeFromMirror(item) {
  if (!item) return null;
  const drwNo = Number(item.draw_no);
  const nums = (item.numbers || []).map(Number).slice(0, 6).sort((a, b) => a - b);
  const bonus = Number(item.bonus_no ?? 0);
  if (!Number.isFinite(drwNo) || nums.length !== 6 || nums.some(n => !Number.isFinite(n))) return null;
  return { drwNo, date: toYYYYMMDD(item.date), nums, bonus };
}

async function tryMirrorAll() {
  const arr = await fetchJSON(MIRROR_ALL);
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = [];
  for (const it of arr) {
    const one = normalizeFromMirror(it);
    if (one) out.push(one);
  }
  out.sort((a, b) => a.drwNo - b.drwNo);
  return out;
}

// Optional: fallback to dhlottery if mirror fails and we have some existing to extend.
async function tryDhlotteryIncremental(existing) {
  const maxExisting = existing.reduce((m, x) => Math.max(m, Number(x.drwNo) || 0), 0);
  if (!maxExisting) return existing;

  const map = new Map(existing.map(x => [Number(x.drwNo), x]));
  const end = maxExisting + 5;
  const start = Math.max(1, maxExisting - 5);

  for (let n = start; n <= end; n++) {
    try {
      const j = await fetchJSON(DHL_API(n));
      if (j && j.returnValue === "success") {
        const nums = [j.drwtNo1, j.drwtNo2, j.drwtNo3, j.drwtNo4, j.drwtNo5, j.drwtNo6].map(Number).sort((a,b)=>a-b);
        const one = { drwNo: Number(j.drwNo), date: String(j.drwNoDate||"").slice(0,10), nums, bonus: Number(j.bnusNo ?? 0) };
        if (one.drwNo && one.nums?.length === 6) map.set(one.drwNo, one);
      }
    } catch {
      // ignore
    }
  }

  return Array.from(map.values()).sort((a, b) => a.drwNo - b.drwNo);
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  const existing = loadExisting();

  // 1) Try mirror first (most reliable on GitHub Actions)
  try {
    const out = await tryMirrorAll();
    if (out.length > 0) {
      fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
      console.log("Updated from mirror:", out.length);
      return;
    }
    console.warn("Mirror returned empty.");
  } catch (e) {
    console.warn("Mirror fetch failed:", String(e).slice(0, 200));
  }

  // 2) Fallback: keep existing (and optionally try a tiny incremental dhlottery refresh)
  let out = existing;
  try {
    out = await tryDhlotteryIncremental(existing);
  } catch {}

  if (!Array.isArray(out) || out.length === 0) {
    throw new Error("No existing data and could not fetch mirror. Aborting to avoid empty JSON.");
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
  console.log("Kept existing data:", out.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
