// devLog.js — dev-console-only logger for chatty lifecycle logging (socket/peer
// state changes and similar). Call-site args are still evaluated in prod builds —
// keep anything expensive inside an explicit `if (import.meta.env.DEV)` guard,
// which remains the repo idiom for one-off logs; this helper exists for files with
// many lifecycle lines where per-site guards drown the code (netcode, p2p).

/** @type {(...args: unknown[]) => void} */
export const devLog = import.meta.env.DEV ? console.log.bind(console) : () => {};
