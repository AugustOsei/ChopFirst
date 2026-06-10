import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

// Storage: Upstash Redis / Vercel KV via REST when configured, otherwise the
// local filesystem. On Vercel without Redis we fall back to /tmp, which only
// survives while a serverless instance stays warm — fine for trying the game,
// not for real challenge links (see README).
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
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
    if (!res.ok) throw new Error(`Redis write failed: ${res.status}`);
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

// Global all-time board: best run per device (anonymous browser id), plus a
// total run counter. Never pruned with challenges.
function recordGlobalRun(store, run, deviceId) {
  if (!store.global) store.global = { totalRuns: 0, players: {} };
  store.global.totalRuns += 1;
  const key = typeof deviceId === "string" && deviceId.length >= 8 ? deviceId.slice(0, 64) : null;
  if (!key) return;
  const existing = store.global.players[key];
  if (!existing || run.timeMs < existing.timeMs) {
    store.global.players[key] = {
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

export async function getGlobalLeaderboard() {
  const store = await readStore();
  const global = store.global || { totalRuns: 0, players: {} };
  const top = Object.values(global.players)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, 25)
    .map((player, index) => ({ ...player, photo: index < 20 ? player.photo : "" }));
  return { totalRuns: global.totalRuns, totalPlayers: Object.keys(global.players).length, top };
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
  const store = await readStore();
  const now = Date.now();
  const id = crypto.randomBytes(5).toString("hex");
  const run = normalizeRun(firstRun, true);
  const challenge = {
    id,
    trackId: "akina-ridge",
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
  const store = await readStore();
  const challenge = store.challenges[id];
  if (!challenge) {
    return { error: "missing" };
  }
  if (Date.now() > new Date(challenge.expiresAt).getTime()) {
    return { error: "expired", challenge: publicChallenge(challenge) };
  }

  const normalized = normalizeRun(run, false);
  challenge.runs.push(normalized);
  if (run.message) {
    challenge.messages.push(normalizeMessage(run.message, normalized));
  }
  recordGlobalRun(store, normalized, run.deviceId);
  await writeStore(store);
  return { challenge: publicChallenge(challenge) };
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
