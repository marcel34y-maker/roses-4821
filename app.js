/* =========================================================
   ROSES — a new 3D bouquet every day, with a note from you.
   Edit the three lines below, then write notes in notes.json.
   ========================================================= */
const CONFIG = {
  herName: "beautiful",          // shows as "Good morning, beautiful". Put her name or a nickname.
  fromName: "Marcel",            // signs every note
  signOff: "Love,",              // shows as "Love, Marcel" under each note
  newDayHour: 8,                 // new bouquet + note each day at 8:00 am her time
  firstDay: "2026-11-18",        // first day of bouquets; history never goes earlier than this
};

import { Bouquet3D } from "./bouquet3d.js";

/* ---------- dates (always her local time) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const longDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/* ---------- seeded randomness: same day = same bouquet ---------- */
function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function rng(key) {
  let a = seedFrom(key);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

/* ---------- what goes in each day's bouquet ---------- */
const STYLES = [
  { name: "Classic Red",   mix: { red: 1 } },
  { name: "Blush",         mix: { pink: 1 } },
  { name: "Ivory",         mix: { white: 1 } },
  { name: "Red & Ivory",   mix: { red: 0.55, white: 0.45 } },
  { name: "Blush & Ivory", mix: { pink: 0.55, white: 0.45 } },
  { name: "Red & Blush",   mix: { red: 0.5, pink: 0.5 } },
  { name: "All Three",     mix: { red: 0.34, pink: 0.33, white: 0.33 } },
  { name: "Garden Party",  mix: { pink: 0.45, white: 0.35, red: 0.2 } },
  { name: "Be Mine",       mix: { red: 0.7, pink: 0.3 } },
  { name: "First Snow",    mix: { white: 0.75, red: 0.25 } },
  { name: "Cotton Candy",  mix: { pink: 0.7, white: 0.3 } },
];
// Special bouquets that only show up when you ask for them in notes.json ("bouquets")
const SPECIAL_STYLES = [
  { name: "Sunflowers", mix: { sunflower: 1 }, count: [13, 16] },
  { name: "Sunshine",   mix: { sunflower: 0.6, white: 0.4 } },
  { name: "Sunset",     mix: { sunflower: 0.5, red: 0.5 } },
  { name: "Roses in a Vase", mix: { red: 0.34, pink: 0.36, white: 0.3 }, count: [18, 21], vase: true },
  { name: "Sorbet & Gardenias", mix: { gardenia: 0.38, peach: 0.2, lavender: 0.18, coral: 0.14, yellow: 0.1 }, count: [16, 19], vase: true },
  { name: "Autumn Sunrise", mix: { tigerlily: 0.3, goldlily: 0.17, sunflower: 0.15, red: 0.2, peach: 0.18 }, count: [16, 18], vase: true, buds: 6 },
  { name: "Lilies & Roses", mix: { lily: 0.55, pink: 0.22, white: 0.15, red: 0.08 }, count: [14, 16], vase: true, buds: 8 },
];

const WRAPS = [
  { front: "#dcb68c", back: "#c49a6c" },  // kraft
  { front: "#f6d3d7", back: "#e7b6bd" },  // blush
  { front: "#f5ecde", back: "#e0d1b9" },  // cream
  { front: "#cbd8c2", back: "#a9bc9e" },  // sage
  { front: "#3a3540", back: "#26222a" },  // midnight
];
const RIBBONS = ["#b3122b", "#f2a5b8", "#fffaf2", "#c9a24a"];

function chooseColor(mix, r) {
  let x = r(), acc = 0;
  for (const [k, w] of Object.entries(mix)) { acc += w; if (x <= acc) return k; }
  return Object.keys(mix)[0];
}

// never the same color mix two days in a row (from this date on; earlier days stay as she saw them)
const NO_REPEAT_FROM = "2026-11-20";
const rawStyle = (key) => Math.floor(rng("roses:" + key)() * STYLES.length);
function styleIndexFor(dateKey) {
  if (dateKey < NO_REPEAT_FROM) return rawStyle(dateKey);
  let d = addDays(parseYmd(dateKey), -60);
  if (ymd(d) < NO_REPEAT_FROM) d = addDays(parseYmd(NO_REPEAT_FROM), -1);
  let prev = rawStyle(ymd(d)), idx = prev;
  for (d = addDays(d, 1); ymd(d) <= dateKey; d = addDays(d, 1)) {
    const key = ymd(d);
    idx = rawStyle(key);
    if (idx === prev) idx = (idx + 1 + (seedFrom("shift:" + key) % (STYLES.length - 1))) % STYLES.length;
    prev = idx;
  }
  return idx;
}

function planFor(dateKey) {
  const r = rng("roses:" + dateKey);
  r();                                              // keep the random sequence the same as before
  let style = STYLES[styleIndexFor(dateKey)];
  const asked = NOTES.bouquets && NOTES.bouquets[dateKey];
  if (asked) style = [...STYLES, ...SPECIAL_STYLES].find((x) => x.name.toLowerCase() === String(asked).toLowerCase()) || style;
  const wrap = r.pick(WRAPS);
  let ribbon = r.pick(RIBBONS);
  if (wrap === WRAPS[2] && ribbon === "#fffaf2") ribbon = "#b3122b";
  const [lo, hi] = style.count || [19, 25];         // 19–25 roses by default
  const count = lo + Math.floor(r() * (hi - lo + 1));
  const roses = Array.from({ length: count }, () => ({ color: chooseColor(style.mix, r) }));
  return { name: style.name, wrap, ribbon, roses, filler: r() < 0.6, vase: !!style.vase, buds: style.buds || 0, r };
}

/* ---------- notes ---------- */
let NOTES = { notes: {}, backup: [] };

async function loadNotes() {
  try {
    const res = await fetch(`notes.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) NOTES = await res.json();
  } catch (_) { /* offline: the service worker serves the last copy */ }
}

function noteFor(dateKey) {
  const exact = NOTES.notes && NOTES.notes[dateKey];
  if (exact) return exact;
  const pool = NOTES.backup || [];
  return pool.length ? pool[seedFrom("note:" + dateKey) % pool.length] : "";
}

/* ---------- UI ---------- */
const $ = (id) => document.getElementById(id);
// the "day" flips at newDayHour, not midnight (before 8 am it's still yesterday's bouquet)
const currentDayKey = () => ymd(new Date(Date.now() - CONFIG.newDayHour * 3600 * 1000));
const todayKey = currentDayKey();
let selected = todayKey;
let scene = null;

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? "Sweet dreams" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${CONFIG.herName}`;
}

function getScene() {
  if (!scene) {
    scene = new Bouquet3D($("bouquet"));
    scene.onPick = () => whisper();
    scene.onPutBack = () => $("whisper").classList.remove("show");
    scene.onInteract = () => {
      const hint = $("hint");
      if (!hint.classList.contains("gone")) { hint.classList.add("gone"); storage.set("hint2-seen", "1"); }
    };
  }
  return scene;
}

/* little messages that pop up when she picks a flower (add your own in notes.json "whispers") */
const DEFAULT_WHISPERS = [
  "I love you", "You're my favorite person", "Thinking of you", "You make me so happy",
  "Can't wait to see you", "You're beautiful", "Lucky me", "Always yours",
];
let whisperTimer, lastWhisper = -1;
function whisper() {
  const list = (NOTES.whispers && NOTES.whispers.length ? NOTES.whispers : DEFAULT_WHISPERS);
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastWhisper) i = (i + 1) % list.length;
  lastWhisper = i;
  const el = $("whisper");
  el.textContent = `${list[i]} ♡`;
  el.classList.add("show");
  clearTimeout(whisperTimer);
  whisperTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function bouquetNumber(key) {
  return Math.round((parseYmd(key) - parseYmd(CONFIG.firstDay)) / 86400000) + 1;
}

function showDay(key, animate) {
  selected = key;
  $("greeting").textContent = key === todayKey ? greeting() : "A bouquet from";
  $("date").textContent = longDate(parseYmd(key));
  $("gift").hidden = true;

  $("bouquet").hidden = false;
  const plan = planFor(key);
  getScene().build(plan, plan.r, animate);

  const label = $("bouquet-name");
  const allOf = (c) => plan.roses.every((x) => x.color === c);
  const kinds = allOf("sunflower") ? "sunflowers" : plan.roses.every((x) => !["sunflower", "lily", "tigerlily", "goldlily", "gardenia"].includes(x.color)) ? "roses" : "flowers";
  const num = bouquetNumber(key);
  label.textContent = `${plan.name} · ${plan.roses.length} ${kinds}` + (num > 0 ? ` · bouquet #${num}` : "");
  label.hidden = false;
  $("hint").hidden = false;
  $("actions").hidden = false;
  $("actions").style.animation = animate ? "" : "none";
  $("whisper").classList.remove("show");
  if (storage.get("hint2-seen")) $("hint").classList.add("gone");

  const text = noteFor(key);
  const note = $("note");
  note.classList.toggle("still", !animate);
  if (text) {
    $("note-text").textContent = text;
    $("note-sign").textContent = `${CONFIG.signOff} ${CONFIG.fromName}`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
  renderDays();
}

function renderDays() {
  const nav = $("days");
  nav.innerHTML = "";
  const first = parseYmd(CONFIG.firstDay);
  const today = parseYmd(todayKey);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < first) continue;
    const key = ymd(d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `${d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}<b>${d.getDate()}</b>`;
    btn.setAttribute("aria-label", longDate(d));
    if (key === selected) btn.setAttribute("aria-current", "true");
    btn.onclick = () => {
      if (key === selected) return;
      if (key === todayKey && !storage.get("opened-" + todayKey)) return showGift();
      showDay(key, true);
    };
    nav.appendChild(btn);
  }
  nav.hidden = nav.children.length < 2;
}

function showGift() {
  selected = todayKey;
  $("greeting").textContent = greeting();
  $("date").textContent = longDate(parseYmd(todayKey));
  ["bouquet", "bouquet-name", "hint", "note", "actions"].forEach((id) => ($(id).hidden = true));
  const gift = $("gift");
  gift.classList.remove("opening");
  gift.hidden = false;
  renderDays();
}

$("btn-water").addEventListener("click", () => scene && scene.water());
$("btn-love").addEventListener("click", () => scene && scene.love());

$("gift").addEventListener("click", () => {
  const gift = $("gift");
  if (gift.classList.contains("opening")) return;
  gift.classList.add("opening");
  storage.set("opened-" + todayKey, "1");
  setTimeout(() => showDay(todayKey, true), 700);
});

/* if the app is open (or reopened) when the new day starts at 8 am, roll over */
const rollover = () => { if (currentDayKey() !== todayKey) location.reload(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") rollover(); });
setInterval(rollover, 60 * 1000);

// for testing: open the app with ?day=2026-12-25 to preview any day's bouquet
const preview = new URLSearchParams(location.search).get("day");

(async function start() {
  await loadNotes();
  if (preview) showDay(preview, true);
  else if (storage.get("opened-" + todayKey)) showDay(todayKey, false);
  else showGift();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
