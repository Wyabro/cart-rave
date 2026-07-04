// challengeStore.js — Vanilla Zustand store for Local Challenge System
import { createStore } from "zustand/vanilla";

export const CHALLENGE_POOL = [
  { id: 'spill_15', type: 'daily', title: 'Spill Master', description: 'Cause 15 opponent spills', goal: 15, event: 'spill' },
  { id: 'spill_50', type: 'weekly', title: 'Wrecking Ball', description: 'Cause 50 opponent spills', goal: 50, event: 'spill' },
  { id: 'combo_t2_5', type: 'daily', title: 'Double Impact', description: 'Reach Combo Tier 2 5 times', goal: 5, event: 'combo_t2' },
  { id: 'combo_t3_10', type: 'weekly', title: 'Combo King', description: 'Reach Combo Tier 3 10 times', goal: 10, event: 'combo_t3' },
  { id: 'ko_void_3', type: 'daily', title: 'Void Sender', description: 'Knock 3 opponents into the void', goal: 3, event: 'ko_void' },
  { id: 'last_standing_2', type: 'daily', title: 'Sole Survivor', description: 'Win 2 rounds as Last Cart Standing', goal: 2, event: 'last_standing' },
  { id: 'ko_npc_20', type: 'weekly', title: 'Bot Buster', description: 'Knockout 20 NPC carts', goal: 20, event: 'ko_npc' },
  { id: 'untouchable_1', type: 'weekly', title: 'Untouchable', description: 'Win a round without spilling', goal: 1, event: 'untouchable' },
  { id: 'sd_win_3', type: 'daily', title: 'Clutch Winner', description: 'Win 3 Sudden Death tiebreakers', goal: 3, event: 'sd_win' },
  { id: 'ko_aggressor_5', type: 'weekly', title: 'Aggressor Hunter', description: 'Knockout 5 Aggressor NPCs', goal: 5, event: 'ko_aggressor' },
];

const STORAGE_KEY = 'cartRaveChallenges';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function shuffleArray(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function selectRandomChallenges(type, count) {
  const pool = CHALLENGE_POOL.filter((c) => c.type === type);
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, count).map((item) => ({
    id: item.id,
    progress: 0,
    isComplete: false,
  }));
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.dailyChallenges) && Array.isArray(parsed.weeklyChallenges)) {
        // Ensure all loaded challenge IDs are valid members of the current CHALLENGE_POOL
        const allValid = [...parsed.dailyChallenges, ...parsed.weeklyChallenges].every(
          (c) => c && CHALLENGE_POOL.some((p) => p.id === c.id)
        );
        if (allValid) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[challengeStore] Failed to load persisted challenges:', err);
  }
  return null;
}

function saveState(state) {
  try {
    const dataToSave = {
      dailyChallenges: state.dailyChallenges,
      weeklyChallenges: state.weeklyChallenges,
      lastDailyReset: state.lastDailyReset,
      lastWeeklyReset: state.lastWeeklyReset,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch (err) {
    console.warn('[challengeStore] Failed to save challenges:', err);
  }
}

const initialPersisted = loadPersistedState();
const now = Date.now();

export const challengeStore = createStore((set, get) => ({
  dailyChallenges: initialPersisted?.dailyChallenges || selectRandomChallenges('daily', 2),
  weeklyChallenges: initialPersisted?.weeklyChallenges || selectRandomChallenges('weekly', 1),
  lastDailyReset: initialPersisted?.lastDailyReset || now,
  lastWeeklyReset: initialPersisted?.lastWeeklyReset || now,

  checkRotations: () => {
    const state = get();
    const currentTime = Date.now();
    let updated = false;

    let dailyChallenges = [...state.dailyChallenges];
    let lastDailyReset = state.lastDailyReset;
    if (!lastDailyReset || currentTime - lastDailyReset >= DAY_MS) {
      dailyChallenges = selectRandomChallenges('daily', 2);
      lastDailyReset = currentTime;
      updated = true;
    }

    let weeklyChallenges = [...state.weeklyChallenges];
    let lastWeeklyReset = state.lastWeeklyReset;
    if (!lastWeeklyReset || currentTime - lastWeeklyReset >= WEEK_MS) {
      weeklyChallenges = selectRandomChallenges('weekly', 1);
      lastWeeklyReset = currentTime;
      updated = true;
    }

    if (updated) {
      const nextState = { dailyChallenges, weeklyChallenges, lastDailyReset, lastWeeklyReset };
      set(nextState);
      saveState(get());
    }
  },

  record: (event, amount = 1) => {
    if (!event) return;
    const state = get();
    let changed = false;

    const updateList = (list) =>
      list.map((ch) => {
        const meta = CHALLENGE_POOL.find((item) => item.id === ch.id);
        if (!meta || meta.event !== event || ch.isComplete) return ch;

        const newProgress = Math.min(meta.goal, ch.progress + amount);
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

// Run initial check for expired rotations on module load
challengeStore.getState().checkRotations();

export const ChallengeTracker = {
  record: (event, amount = 1) => challengeStore.getState().record(event, amount),
  checkRotations: () => challengeStore.getState().checkRotations(),
};
