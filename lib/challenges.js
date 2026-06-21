import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { TRACK, listTracks } from "../game/track.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// --- track registry --------------------------------------------------------
// Times and ghost traces (spline distances) are only meaningful within one
// track, so every run carries a trackId. Data written before multi-track
// support has no trackId and is all Akina Ridge — resolveTrackId() maps that
// legacy data to the default. New tracks register their numbers here.
export const DEFAULT_TRACK_ID = TRACK.id;

const TRACKS = Object.fromEntries(
  listTracks().map((t) => [t.id, { totalDistance: t.laps * t.totalLength }]),
);

export function resolveTrackId(trackId) {
  return trackId == null || trackId === "" ? DEFAULT_TRACK_ID : String(trackId);
}

// --- run verification (anti-cheat) ---------------------------------------
// Deliberately LENIENT. This is a free, for-fun game, so falsely rejecting a
// real player's run (which kills their momentum and blocks sharing) is far worse
// than a faked time slipping onto a casual leaderboard. We therefore block ONLY
// what can never come from genuine play — a post with no real race data, or a
// time physically faster than the car could traverse the course — and accept
// everything else. None of these checks can trigger on an honest run: every real
// run carries a full ghost trace and a time well above the physical floor. We do
// NOT inspect per-segment speed, boost counts, or coin counts: those produced
// false rejections (recording glitches, a star miscount) for no real protection.
const MAX_PLAUSIBLE_SPEED = 70; // car hard cap is 64 m/s; 70 leaves headroom
const MAX_RUN_MS = 30 * 60 * 1000;
const MIN_GHOST_SAMPLES = 50;
const COURSE_COVERAGE_SLACK = 120; // metres of finish-line slack on the trace

export function validateRun(run) {
  const track = TRACKS[resolveTrackId(run?.trackId)];
  if (!track) return "unknown track";
  const totalDistance = track.totalDistance;
  const timeMs = Number(run?.timeMs);
  if (!Number.isFinite(timeMs) || timeMs <= 0) return "missing time";
  if (timeMs > MAX_RUN_MS) return "run too long";
  if (timeMs < (totalDistance / MAX_PLAUSIBLE_SPEED) * 1000) return "time faster than physically possible";

  // Must carry a real race trace: a bare/forged post has none, too few samples,
  // or a path that never gets near the finish line.
  const ghost = run?.ghost;
  if (!Array.isArray(ghost) || ghost.length < MIN_GHOST_SAMPLES) return "missing ghost trace";
  let maxDistance = -Infinity;
  for (const sample of ghost) {
    if (!sample || !Number.isFinite(sample.t) || !Number.isFinite(sample.d)) return "malformed ghost trace";
    if (sample.d > maxDistance) maxDistance = sample.d;
  }
  if (maxDistance < totalDistance - COURSE_COVERAGE_SLACK) return "ghost trace does not cover the course";
  return null;
}

// Storage: Upstash Redis / Vercel KV via REST when configured, otherwise the
// local filesystem. On Vercel without Redis we fall back to /tmp, which only
// survives while a serverless instance stays warm — fine for trying the game,
// not for real challenge links (see README).
const RAW_REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
// tolerate an endpoint pasted without the scheme
const REDIS_URL = RAW_REDIS_URL && !RAW_REDIS_URL.startsWith("http") ? `https://${RAW_REDIS_URL}` : RAW_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const REDIS_KEY = "chopfirst:challenges";
const DATA_DIR = process.env.VERCEL ? "/tmp/chop-first" : path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "challenges.json");

async function readStore() {
  if (REDIS_URL && REDIS_TOKEN) {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis read failed: ${res.status}`);
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : { challenges: {} };
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { challenges: {} };
    }
    throw error;
  }
}

async function writeStore(store) {
  pruneExpired(store);
  if (REDIS_URL && REDIS_TOKEN) {
    const res = await fetch(`${REDIS_URL}/set/${REDIS_KEY}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(store),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // 401 with "NOPERM"/unauthorized usually means the READONLY token was configured
      throw new Error(`Redis write failed: ${res.status} ${detail.slice(0, 200)}`);
    }
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

function pruneExpired(store, graceMs = DAY_MS) {
  const now = Date.now();
  for (const [id, challenge] of Object.entries(store.challenges)) {
    if (now > new Date(challenge.expiresAt).getTime() + graceMs) {
      delete store.challenges[id];
    }
  }
}

// Global all-time board: best run per device (anonymous browser id) per track,
// plus a total run counter across all tracks. Never pruned with challenges.
// Boards written before multi-track support lived flat at global.players (all
// Akina Ridge) — first write after this deploy folds them into global.tracks.
function globalBoard(store, trackId) {
  if (!store.global) store.global = { totalRuns: 0 };
  if (!store.global.tracks) store.global.tracks = {};
  if (store.global.players) {
    store.global.tracks[DEFAULT_TRACK_ID] = {
      players: { ...store.global.players, ...(store.global.tracks[DEFAULT_TRACK_ID]?.players || {}) },
    };
    delete store.global.players;
  }
  if (!store.global.tracks[trackId]) store.global.tracks[trackId] = { players: {} };
  return store.global.tracks[trackId];
}

function recordGlobalRun(store, run, deviceId) {
  const board = globalBoard(store, resolveTrackId(run.trackId));
  store.global.totalRuns = (store.global.totalRuns || 0) + 1;
  const key = typeof deviceId === "string" && deviceId.length >= 8 ? deviceId.slice(0, 64) : null;
  if (!key) return;
  const existing = board.players[key];
  if (!existing || run.timeMs < existing.timeMs) {
    board.players[key] = {
      name: run.name,
      photo: run.photo,
      timeMs: run.timeMs,
      coins: run.coins,
      driftScore: run.driftScore,
      at: Date.now(),
    };
  } else {
    existing.name = run.name; // keep the latest display name
  }
}

// Diagnostic used by /api/health: reports which storage backend is active and
// whether it can actually read and write. Never exposes the token.
export async function storageHealth() {
  const usingRedis = Boolean(REDIS_URL && REDIS_TOKEN);
  const health = {
    storage: usingRedis ? "redis" : process.env.VERCEL ? "tmp (EPHEMERAL — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then redeploy)" : "local file",
    redisUrlConfigured: Boolean(RAW_REDIS_URL),
    redisTokenConfigured: Boolean(REDIS_TOKEN),
    canRead: false,
    canWrite: false,
  };
  try {
    await readStore();
    health.canRead = true;
  } catch (error) {
    health.readError = String(error?.message || error);
  }
  try {
    if (usingRedis) {
      const res = await fetch(`${REDIS_URL}/set/chopfirst:healthcheck`, {
        method: "POST",
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        body: String(Date.now()),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status} ${detail.slice(0, 200)}${res.status === 401 ? " — if the token is correct, you may have copied the READONLY token instead of the standard one" : ""}`);
      }
    } else {
      await writeStore(await readStore());
    }
    health.canWrite = true;
  } catch (error) {
    health.writeError = String(error?.message || error);
  }
  return health;
}

// --- funnel metrics -------------------------------------------------------
// Per-day event counters (link opened, race started/finished, shares…).
// Redis uses HINCRBY on a per-day hash so concurrent events never clobber
// each other; local dev uses a separate metrics.json.
const METRICS_PREFIX = "chopfirst:metrics:";
const METRICS_FILE = path.join(DATA_DIR, "metrics.json");

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export async function recordEvent(event) {
  const day = dayKey(new Date());
  if (REDIS_URL && REDIS_TOKEN) {
    const res = await fetch(`${REDIS_URL}/hincrby/${METRICS_PREFIX}${day}/${event}/1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Redis metrics write failed: ${res.status}`);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  let metrics = {};
  try {
    metrics = JSON.parse(await fs.readFile(METRICS_FILE, "utf8"));
  } catch {
    // first event ever
  }
  if (!metrics[day]) metrics[day] = {};
  metrics[day][event] = (metrics[day][event] || 0) + 1;
  await fs.writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

export async function getMetrics(days = 14) {
  const out = {};
  if (REDIS_URL && REDIS_TOKEN) {
    await Promise.all(
      Array.from({ length: days }, (_, i) => {
        const day = dayKey(new Date(Date.now() - i * DAY_MS));
        return fetch(`${REDIS_URL}/hgetall/${METRICS_PREFIX}${day}`, {
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          cache: "no-store",
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const flat = data?.result;
            if (!Array.isArray(flat) || !flat.length) return;
            const counts = {};
            for (let j = 0; j < flat.length; j += 2) counts[flat[j]] = Number(flat[j + 1]);
            out[day] = counts;
          });
      }),
    );
    return out;
  }
  let metrics = {};
  try {
    metrics = JSON.parse(await fs.readFile(METRICS_FILE, "utf8"));
  } catch {
    return out;
  }
  const cutoff = dayKey(new Date(Date.now() - days * DAY_MS));
  for (const [day, counts] of Object.entries(metrics)) {
    if (day >= cutoff) out[day] = counts;
  }
  return out;
}

// Player feedback (bug reports / feature ideas). Newest first, capped so a
// spammer can't bloat the store. Never pruned with challenges.
const FEEDBACK_LIMIT = 200;

export async function addFeedback(payload) {
  const message = String(payload?.message || "").trim().slice(0, 500);
  if (!message) return { error: "empty" };
  const store = await readStore();
  if (!Array.isArray(store.feedback)) store.feedback = [];
  store.feedback.unshift({
    id: crypto.randomUUID(),
    type: payload.type === "idea" ? "idea" : "bug",
    message,
    name: String(payload.name || "").slice(0, 32),
    contact: String(payload.contact || "").slice(0, 80),
    at: new Date().toISOString(),
  });
  store.feedback = store.feedback.slice(0, FEEDBACK_LIMIT);
  await writeStore(store);
  return { ok: true };
}

export async function getGlobalLeaderboard(trackId = DEFAULT_TRACK_ID) {
  const store = await readStore();
  const global = store.global || { totalRuns: 0 };
  // read both layouts without writing: tracks (current) or flat players (legacy)
  const players =
    global.tracks?.[trackId]?.players ||
    (trackId === DEFAULT_TRACK_ID ? global.players : null) ||
    {};
  const top = Object.values(players)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, 25)
    .map((player, index) => ({ ...player, photo: index < 20 ? player.photo : "" }));
  return { trackId, totalRuns: global.totalRuns || 0, totalPlayers: Object.keys(players).length, top };
}

export async function addMessage(id, payload) {
  const store = await readStore();
  const challenge = store.challenges[id];
  if (!challenge) return { error: "missing" };
  if (!payload?.message) return { error: "empty" };
  challenge.messages.push(
    normalizeMessage(payload.message, {
      name: String(payload.name || "Street Driver").slice(0, 32),
      photo: safePhoto(payload.photo),
    }),
  );
  await writeStore(store);
  return { challenge: publicChallenge(challenge) };
}

function publicChallenge(challenge) {
  const now = Date.now();
  return {
    ...challenge,
    expired: now > new Date(challenge.expiresAt).getTime(),
    runs: [...challenge.runs].sort((a, b) => a.timeMs - b.timeMs),
  };
}

export async function createChallenge(firstRun) {
  const invalid = validateRun(firstRun);
  if (invalid) return { error: "invalid", reason: invalid };
  const store = await readStore();
  const now = Date.now();
  const id = crypto.randomBytes(5).toString("hex");
  const run = normalizeRun(firstRun, true);
  const challenge = {
    id,
    trackId: run.trackId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DAY_MS).toISOString(),
    runs: [run],
    messages: firstRun.message ? [normalizeMessage(firstRun.message, run)] : [],
  };
  store.challenges[id] = challenge;
  recordGlobalRun(store, run, firstRun.deviceId);
  await writeStore(store);
  return publicChallenge(challenge);
}

export async function getChallenge(id) {
  const store = await readStore();
  const challenge = store.challenges[id];
  return challenge ? publicChallenge(challenge) : null;
}

export async function addRun(id, run) {
  const invalid = validateRun(run);
  if (invalid) return { error: "invalid", reason: invalid };
  const store = await readStore();
  const challenge = store.challenges[id];
  if (!challenge) {
    return { error: "missing" };
  }
  // times/ghosts aren't comparable across tracks — never mix them in one board
  if (resolveTrackId(run.trackId) !== resolveTrackId(challenge.trackId)) {
    return { error: "wrongTrack", challenge: publicChallenge(challenge) };
  }

  // Every run rolls the 24h window forward (an active rivalry never times out
  // mid-battle), and a run on a lapsed-but-not-yet-pruned challenge revives it
  // rather than dead-ending — so a friend who replies late, or the sender
  // reopening a dormant link, brings it straight back to life.
  const now = Date.now();
  const revived = now > new Date(challenge.expiresAt).getTime();
  challenge.expiresAt = new Date(now + DAY_MS).toISOString();

  const normalized = normalizeRun(run, false);
  challenge.runs.push(normalized);
  if (run.message) {
    challenge.messages.push(normalizeMessage(run.message, normalized));
  }
  recordGlobalRun(store, normalized, run.deviceId);
  await writeStore(store);
  return { challenge: publicChallenge(challenge), revived };
}

function normalizeMessage(message, run) {
  return {
    id: crypto.randomUUID(),
    name: run.name,
    photo: run.photo,
    message: String(message).slice(0, 100),
    at: Date.now(),
  };
}

function normalizeRun(run, founder) {
  return {
    id: crypto.randomUUID(),
    founder,
    trackId: resolveTrackId(run.trackId),
    name: String(run.name || "Street Driver").slice(0, 32),
    photo: safePhoto(run.photo),
    timeMs: Math.max(0, Math.round(Number(run.timeMs) || 0)),
    coins: Math.max(0, Math.round(Number(run.coins) || 0)),
    driftScore: Math.max(0, Math.round(Number(run.driftScore) || 0)),
    boostUses: Math.max(0, Math.round(Number(run.boostUses) || 0)),
    finishedAt: new Date().toISOString(),
    ghost: Array.isArray(run.ghost) ? run.ghost.slice(0, 500) : [],
  };
}

function safePhoto(photo) {
  if (typeof photo !== "string") return "";
  if (!photo.startsWith("data:image/")) return "";
  return photo.length > 180000 ? "" : photo;
}
