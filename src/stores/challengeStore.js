// challengeStore.js — Vanilla Zustand store for Local Challenge System
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGetJson, storageSetJson } from "../utils/storage.js";
import { UnlockTracker } from "./unlockStore.js";
import { PROGRESSION_EVENTS } from "../progression/eventIds.js";

export const CHALLENGE_POOL = [
  { id: 'spill_15', type: 'daily', title: 'Spill Master', description: 'Cause 15 opponent spills', goal: 15, event: PROGRESSION_EVENTS.SPILL },
  { id: 'spill_50', type: 'weekly', title: 'Wrecking Ball', description: 'Cause 50 opponent spills', goal: 50, event: PROGRESSION_EVENTS.SPILL },
  { id: 'combo_t2_5', type: 'daily', title: 'Double Impact', description: 'Reach SAVAGE 5 times', goal: 5, event: PROGRESSION_EVENTS.COMBO_T2 },
  { id: 'combo_t3_10', type: 'weekly', title: 'Combo King', description: 'Reach CARNAGE 10 times', goal: 10, event: PROGRESSION_EVENTS.COMBO_T3 },
  { id: 'ko_void_3', type: 'daily', title: 'Void Sender', description: 'Knock 3 opponents into the void', goal: 3, event: PROGRESSION_EVENTS.KO_VOID },
  { id: 'last_standing_2', type: 'daily', title: 'Sole Survivor', description: 'Win 2 rounds as Last Cart Standing', goal: 2, event: PROGRESSION_EVENTS.LAST_STANDING },
  { id: 'round_complete_3', type: 'daily', title: 'Clocked In', description: 'Finish 3 rounds', goal: 3, event: PROGRESSION_EVENTS.ROUND_COMPLETE },
  { id: 'round_win_1', type: 'daily', title: 'Checkout Champion', description: 'Win 1 round', goal: 1, event: PROGRESSION_EVENTS.ROUND_WIN },
  { id: 'combo_t3_2', type: 'daily', title: 'Bulk Damage', description: 'Reach CARNAGE 2 times', goal: 2, event: PROGRESSION_EVENTS.COMBO_T3 },
  { id: 'round_scored_3', type: 'daily', title: 'Ring It Up', description: 'Score in 3 rounds', goal: 3, event: PROGRESSION_EVENTS.ROUND_SCORED },
  { id: 'ko_npc_20', type: 'weekly', title: 'Bot Buster', description: 'KO 20 NPC carts', goal: 20, event: PROGRESSION_EVENTS.KO_NPC },
  { id: 'untouchable_1', type: 'weekly', title: 'Untouchable', description: 'Win a round without spilling', goal: 1, event: PROGRESSION_EVENTS.UNTOUCHABLE },
  { id: 'sd_win_3', type: 'daily', title: 'Clutch Winner', description: 'Win 3 Sudden Death tiebreakers', goal: 3, event: PROGRESSION_EVENTS.SUDDEN_DEATH_WIN },
  { id: 'ko_aggressor_5', type: 'weekly', title: 'Aggressor Hunter', description: 'KO 5 Aggressor NPCs', goal: 5, event: PROGRESSION_EVENTS.KO_AGGRESSOR },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const CHALLENGE_ACTIVE_COUNTS = Object.freeze({ daily: 4, weekly: 2 });

/**
 * Rotation windows, exported so UI can show a real "restocks in …" countdown off
 * `lastDailyReset` / `lastWeeklyReset` instead of re-deriving the periods.
 * @type {{ daily: number, weekly: number }}
 */
export const CHALLENGE_ROTATION_MS = { daily: DAY_MS, weekly: WEEK_MS };

function shuffleArray(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function makeChallengeState(meta, progress = 0) {
  const safeProgress = Math.min(meta.goal, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return {
    id: meta.id,
    progress: safeProgress,
    isComplete: safeProgress >= meta.goal,
  };
}

function selectRandomChallenges(type, count, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const pool = CHALLENGE_POOL.filter((c) => c.type === type && !excluded.has(c.id));
  if (pool.length < count) {
    throw new Error(`Challenge pool cannot provide ${count} unique ${type} entries`);
  }
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, count).map((item) => makeChallengeState(item));
}

function normalizeChallengeList(list, type, count) {
  const seen = new Set();
  const normalized = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) continue;
    const meta = CHALLENGE_POOL.find((item) => item.id === entry.id && item.type === type);
    if (!meta) continue;
    seen.add(meta.id);
    const rawProgress = Number(entry.progress);
    normalized.push(makeChallengeState(meta, Number.isFinite(rawProgress) ? rawProgress : 0));
    if (normalized.length >= count) break;
  }
  return [
    ...normalized,
    ...selectRandomChallenges(type, count - normalized.length, [...seen]),
  ];
}

function normalizeResetTimestamp(value, currentTime) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > currentTime) return currentTime;
  return timestamp;
}

function loadPersistedState(currentTime) {
  const parsed = storageGetJson(STORAGE_KEYS.challenges, null);
  if (!parsed || !Array.isArray(parsed.dailyChallenges) || !Array.isArray(parsed.weeklyChallenges)) return null;
  const state = {
    dailyChallenges: normalizeChallengeList(parsed.dailyChallenges, "daily", CHALLENGE_ACTIVE_COUNTS.daily),
    weeklyChallenges: normalizeChallengeList(parsed.weeklyChallenges, "weekly", CHALLENGE_ACTIVE_COUNTS.weekly),
    lastDailyReset: normalizeResetTimestamp(parsed.lastDailyReset, currentTime),
    lastWeeklyReset: normalizeResetTimestamp(parsed.lastWeeklyReset, currentTime),
  };
  const persisted = {
    dailyChallenges: parsed.dailyChallenges,
    weeklyChallenges: parsed.weeklyChallenges,
    lastDailyReset: parsed.lastDailyReset,
    lastWeeklyReset: parsed.lastWeeklyReset,
  };
  return { state, needsSave: JSON.stringify(persisted) !== JSON.stringify(state) };
}

function saveState(state) {
  storageSetJson(STORAGE_KEYS.challenges, {
    dailyChallenges: state.dailyChallenges,
    weeklyChallenges: state.weeklyChallenges,
    lastDailyReset: state.lastDailyReset,
    lastWeeklyReset: state.lastWeeklyReset,
  });
}

const now = Date.now();
const loadedPersisted = loadPersistedState(now);
const initialPersisted = loadedPersisted?.state || null;

export const challengeStore = createStore((set, get) => ({
  dailyChallenges: initialPersisted?.dailyChallenges || selectRandomChallenges('daily', CHALLENGE_ACTIVE_COUNTS.daily),
  weeklyChallenges: initialPersisted?.weeklyChallenges || selectRandomChallenges('weekly', CHALLENGE_ACTIVE_COUNTS.weekly),
  lastDailyReset: initialPersisted?.lastDailyReset || now,
  lastWeeklyReset: initialPersisted?.lastWeeklyReset || now,

  checkRotations: () => {
    const state = get();
    const currentTime = Date.now();
    let updated = false;

    let dailyChallenges = normalizeChallengeList(state.dailyChallenges, 'daily', CHALLENGE_ACTIVE_COUNTS.daily);
    let lastDailyReset = state.lastDailyReset;
    if (!lastDailyReset || currentTime - lastDailyReset >= DAY_MS) {
      // * CHAL-ROTATE-REPEAT-1: exclude the outgoing set so a just-rotated challenge
      // * cannot re-pick immediately with its progress reset to 0.
      dailyChallenges = selectRandomChallenges(
        'daily',
        CHALLENGE_ACTIVE_COUNTS.daily,
        dailyChallenges.map((c) => c.id),
      );
      lastDailyReset = currentTime;
      updated = true;
    }

    let weeklyChallenges = normalizeChallengeList(state.weeklyChallenges, 'weekly', CHALLENGE_ACTIVE_COUNTS.weekly);
    let lastWeeklyReset = state.lastWeeklyReset;
    if (!lastWeeklyReset || currentTime - lastWeeklyReset >= WEEK_MS) {
      // * CHAL-ROTATE-REPEAT-1: same exclusion for the weekly shelf.
      weeklyChallenges = selectRandomChallenges(
        'weekly',
        CHALLENGE_ACTIVE_COUNTS.weekly,
        weeklyChallenges.map((c) => c.id),
      );
      lastWeeklyReset = currentTime;
      updated = true;
    }

    if (dailyChallenges.length !== state.dailyChallenges.length || weeklyChallenges.length !== state.weeklyChallenges.length) {
      updated = true;
    }

    if (updated) {
      const nextState = { dailyChallenges, weeklyChallenges, lastDailyReset, lastWeeklyReset };
      set(nextState);
      saveState(get());
    }
  },

  record: (event, amount = 1) => {
    if (!event || !Number.isFinite(amount) || amount <= 0) return;
    // * CHAL-ROTATE-RECORD-1: a session crossing the daily/weekly boundary mid-game must
    // * rotate BEFORE crediting — otherwise SPILL/ROUND_*/KO land on the just-expired set
    // * and that progress is discarded at the next rotation. No-op when nothing expired.
    get().checkRotations();
    const state = get();
    let changed = false;

    const updateList = (list) =>
      list.map((ch) => {
        const meta = CHALLENGE_POOL.find((item) => item.id === ch.id);
        if (!meta || meta.event !== event || ch.isComplete) return ch;

        const currentProgress = Number.isFinite(ch.progress) ? ch.progress : 0;
        const newProgress = Math.min(meta.goal, Math.max(0, currentProgress) + amount);
        const isComplete = newProgress >= meta.goal;
        if (newProgress !== ch.progress || isComplete !== ch.isComplete) {
          changed = true;
          return { ...ch, progress: newProgress, isComplete };
        }
        return ch;
      });

    const nextDaily = updateList(state.dailyChallenges);
    const nextWeekly = updateList(state.weeklyChallenges);

    if (changed) {
      set({ dailyChallenges: nextDaily, weeklyChallenges: nextWeekly });
      saveState(get());
    }
  },
}));

if (loadedPersisted?.needsSave) saveState(challengeStore.getState());

// Run initial check for expired rotations on module load
challengeStore.getState().checkRotations();

export const ChallengeTracker = {
  record: (event, amount = 1) => {
    challengeStore.getState().record(event, amount);
    // * Lifetime cosmetic unlocks share the same event ids (permanent goals).
    UnlockTracker.recordEvent(event, amount);
  },
  checkRotations: () => challengeStore.getState().checkRotations(),
};
