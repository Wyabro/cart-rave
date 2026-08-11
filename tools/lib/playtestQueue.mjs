/**
 * playtestQueue.mjs — pure builders for the generated playtest console.
 *
 * Seeds one card per work item that explicitly needs a human playtest:
 *   A) STATUS active-queue / open-issue rows where blockedOnWyatt(status)
 *   B) BACKLOG table rows whose notes/item contain "Owed: Wyatt playtest" (or kin)
 *
 * Synthetic system cards: PREFLIGHT (first) + EXPORT (last) when any owed card exists.
 * IDs are stable work ids so browser localStorage survives regen.
 */

import {
  blockedOnWyatt,
  extractWorkId,
  parseStatusPlaytestQueue,
  parseStatusOpenIssues,
  parseBacklogSections,
  issueState,
  WORK_ID_RE,
} from "./projectHealth.mjs";

/** @typedef {"solo" | "mp"} PlaytestRig */
/** @typedef {"tag" | "hint" | "default"} RigVia */
/** @typedef {{ id: string, phase: string, title: string, do: string, context: string, steps: string[], tail: string, expect: string, f8: string, source: string, priority: string, rig: PlaytestRig, rigVia: RigVia, requiresNote?: boolean, notePrompt?: string }} PlaytestCard */
/** @typedef {{ id: string, reason: "step-overflow" | "multi-id", detail: string }} PlaytestWarning */

const OWED_BACKLOG_RE =
  /owed:\s*wyatt\s+playtest|needs?\s+wyatt(?:'s)?\s+(?:multiplayer\s+)?playtest|playtest\s+requested/i;

/**
 * Rig classification — which cards need the second machine.
 *
 * Order of authority: explicit `[2pc]` / `[solo]` tag → keyword hint → solo.
 *
 * Only ever run against **source** text (a BACKLOG Item + Notes cell, a STATUS
 * What + Status cell) — never against a card's generated `do`, which says
 * "hard-refresh both machines if multiplayer" on every STATUS row and would
 * classify the entire queue as two-machine.
 *
 * Bare "MP" is deliberately NOT a hint: CAM-READY-1's notes end "MP countdown
 * unchanged" and FV-WILT-1's owed line reads "winnerSlotIndex on MP", so the
 * token appears on solo and two-machine rows alike. FV-WILT-1 carries `[2pc]`.
 */
const RIG_TAG_SOLO_RE = /\[\s*(?:solo|1\s*-?\s*pc)\s*\]/i;
const RIG_TAG_MP_RE = /\[\s*(?:2\s*-?\s*pc|two\s*-?\s*pc)\s*\]/i;
const RIG_MP_HINT_RE =
  /\btwo\s+clients?\b|\bboth\s+machines\b|\bsecond\s+client\b|\bnon-host\b|\bmultiplayer\b|\bfriends\s+room\b|\bhost\s+migration\b/i;

/**
 * @param {string} sourceText
 * @returns {{ rig: PlaytestRig, via: RigVia }}
 */
export function classifyRig(sourceText) {
  const s = String(sourceText ?? "");
  const solo = RIG_TAG_SOLO_RE.test(s);
  const mp = RIG_TAG_MP_RE.test(s);
  // Both tags on one row is an authoring error; resolve toward mp, because a
  // false-solo card costs a sitting without the second machine while a false-mp
  // card only sorts late.
  if (mp) return { rig: "mp", via: "tag" };
  if (solo) return { rig: "solo", via: "tag" };
  if (RIG_MP_HINT_RE.test(s)) return { rig: "mp", via: "hint" };
  return { rig: "solo", via: "default" };
}

/** @type {Record<RigVia, number>} */
const RIG_VIA_RANK = { tag: 3, hint: 2, default: 1 };

// Fresh global copy of the shared work-id shape. `String.prototype.matchAll` requires
// the `g` flag but does not mutate the regex's `lastIndex` between calls (it clones
// internally per spec), so one module-level instance is safe to reuse across every
// card in a queue — unlike `.exec()` in a loop, which would need explicit resets.
const WORK_ID_RE_G = new RegExp(WORK_ID_RE.source, "g");

/** @param {string} text */
function allWorkIds(text) {
  return [...String(text ?? "").matchAll(WORK_ID_RE_G)].map((m) => m[1]);
}

const MAX_STEPS_BEFORE_WARN = 5;

/**
 * Flag playtest cards that read as more than one independent verdict — the MAIN-1
 * failure shape (BACKLOG § Playtest console seed): a real defect can ride inside a
 * green PASS when a card bundles unrelated checks with nowhere for a mixed result to
 * go. Two signals, both deliberately narrow:
 *
 *   - **step overflow** — more than MAX_STEPS_BEFORE_WARN numbered steps. A legit
 *     single check runs 2-4 "get here → do this → look at that" steps; MAIN-1 had 7.
 *   - **multiple foreign work ids** — >=2 distinct ids other than the card's own,
 *     found in `steps` + `tail` ONLY (never `do`/`context`). A single cross-ref in a
 *     step is ordinary card prose (UI-P2-PAUSE-PT-1's steps cite TOUCH-HOVER-1) —
 *     which is why the bar is >=2, not >=1 — and scanning the goal/context sentence
 *     would false-positive today on cards that just *mention* a related id
 *     (NET-LOOK-ACC-1 → NET-AUDIT-SLOTS-LOOK-1, SHARD-PT-2 → SHARD-PT-1). Widening
 *     either the scope or the threshold "for safety" breaks the very next real queue.
 *
 * Warning only. This does not gate `health:check` (not until it survives a few real
 * exports without a false positive) and does not auto-split rows — the split has to
 * happen in BACKLOG, where PASS bookkeeping is anchored, not in the generator.
 *
 * @param {PlaytestCard[]} cards
 * @returns {PlaytestWarning[]}
 */
export function multiIssueWarnings(cards) {
  /** @type {PlaytestWarning[]} */
  const warnings = [];
  for (const c of cards || []) {
    if (!c || c.source === "system") continue;
    const steps = c.steps || [];
    if (steps.length > MAX_STEPS_BEFORE_WARN) {
      warnings.push({
        id: c.id,
        reason: "step-overflow",
        detail: `${steps.length} steps (cap ${MAX_STEPS_BEFORE_WARN}) — split the BACKLOG row, one issue per card.`,
      });
    }
    const foreign = [...new Set(allWorkIds(`${steps.join("\n")}\n${c.tail || ""}`))].filter(
      (id) => id !== c.id,
    );
    if (foreign.length >= 2) {
      warnings.push({
        id: c.id,
        reason: "multi-id",
        detail: `steps/tail name ${foreign.join(", ")} — split the BACKLOG row, one issue per card.`,
      });
    }
  }
  return warnings;
}

/**
 * Combine the rig verdicts of two rows describing the same work id (STATUS and
 * BACKLOG both carry ROUND-WEDGE-1). The stronger signal wins; on a tie, mp does.
 * @param {PlaytestCard} a
 * @param {PlaytestCard} b
 * @returns {{ rig: PlaytestRig, rigVia: RigVia }}
 */
export function mergeRig(a, b) {
  const ra = RIG_VIA_RANK[a.rigVia] || 1;
  const rb = RIG_VIA_RANK[b.rigVia] || 1;
  if (ra !== rb) {
    const win = ra > rb ? a : b;
    return { rig: win.rig, rigVia: win.rigVia };
  }
  if (a.rig === b.rig) return { rig: a.rig, rigVia: a.rigVia };
  return { rig: "mp", rigVia: a.rigVia };
}

/**
 * @param {string} itemCell
 * @param {string} notes
 * @returns {boolean}
 */
export function backlogRowOwesPlaytest(itemCell, notes) {
  const blob = `${itemCell}\n${notes}`;
  if (/\bDone\b/i.test(String(itemCell).slice(0, 8))) return false;
  // Closed already
  if (/\bwyatt\s+playtest\s+PASS\b/i.test(blob) && !/owed:\s*wyatt\s+playtest/i.test(blob)) return false;
  if (blockedOnWyatt(blob)) return true;
  return OWED_BACKLOG_RE.test(blob);
}

/**
 * Turn an authored owed-playtest cell into something a human reads and executes.
 *
 * The cells are written as: an "Owed: Wyatt playtest — ID — one-line check"
 * headline, then `<br>`-separated numbered steps, then optional closing prose.
 * Previously the whole thing was pasted into one string and cut at 200 chars,
 * which dropped real instructions — SUNDIAL-PT-1 lost steps 3-6, FV-WILT-1 lost
 * the console line. Nothing here truncates.
 *
 * @param {string} notes
 * @param {string} [id]
 * @returns {{ goal: string, context: string, steps: string[], tail: string }}
 */
export function parseOwedCheck(notes, id = "") {
  const segments = String(notes ?? "")
    .replace(/\r/g, "")
    .split(/<br\s*\/?>/i)
    .map((s) => stripInlineMarkup(s))
    .filter(Boolean);

  /** @type {string[]} */
  const steps = [];
  /** @type {string[]} */
  const tailParts = [];
  let head = "";

  for (const [i, seg] of segments.entries()) {
    const numbered = seg.match(/^(\d+)[.)]\s*(.+)$/s);
    if (numbered) {
      steps.push(numbered[2].trim());
    } else if (i === 0) {
      head = seg;
    } else if (steps.length > 0) {
      // Closing prose after the list — ROUND-WEDGE-1's "cap-217 stays open until
      // you say PASS" lives here and is worth keeping.
      tailParts.push(seg);
    }
  }

  // Drop the "Owed: Wyatt playtest — ID —" ceremony; the card header already
  // shows the id, and repeating it three times before the first instruction is
  // most of why these read as machine output.
  head = head
    .replace(/^owed:?\s*(?:retest\s+)?(?:wyatt(?:'s)?\s+)?playtest\s*[—–:-]*\s*/i, "")
    .replace(/^owed:?\s*/i, "")
    .trim();
  if (id) head = head.replace(new RegExp(`^${escapeForRegExp(id)}\\s*[—–:-]\\s*`), "").trim();

  // First sentence is the goal; anything else in that segment is context.
  const split = head.match(/^(.{12,}?[.!?])\s+(.*)$/s);
  const goal = (split ? split[1] : head).trim();
  const context = (split ? split[2] : "").trim();

  return { goal, context, steps, tail: tailParts.join(" ").trim() };
}

/** @param {string} s */
function stripInlineMarkup(s) {
  return String(s ?? "")
    // Markdown links keep their label — a raw "(./art-pass-sundial-handover.md)"
    // in the middle of a step is exactly the noise these cards are full of.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*(\S[^*]*?)\*/g, "$1")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} s */
function escapeForRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prefer whichever of two rows for the same id actually carries a human
 * checklist. STATUS owns ROUND-WEDGE-1 but describes it in netcode internals;
 * the executable steps live in its BACKLOG row.
 * @param {{ goal: string, context: string, steps: string[], tail: string }} a
 * @param {{ goal: string, context: string, steps: string[], tail: string }} b
 */
export function mergeCheck(a, b) {
  if (b.steps.length && !a.steps.length) return b;
  if (a.steps.length && !b.steps.length) return a;
  return b.goal ? b : a;
}

/**
 * Strip priority / done prefix and em-dash title from a backlog Item cell.
 * @param {string} itemCell
 */
function parseBacklogItem(itemCell) {
  let s = String(itemCell ?? "").replace(/\*\*/g, "").trim();
  // Tech-debt tables put id in a separate column; engineering uses "ID — title" in Item.
  const id = extractWorkId(s);
  let title = s;
  if (id) {
    title = s
      .replace(new RegExp(`^${id}\\s*[—–-]\\s*`), "")
      .replace(new RegExp(`\\b${id}\\b\\s*[—–-]?\\s*`), "")
      .trim();
  }
  // Drop trailing [pre-ship] / [SHIP-1 …] tags from the display title (kept in notes).
  title = title.replace(/\s*`?\[[^\]]+\]`?\s*$/g, "").trim() || s;
  return { id, title };
}

/**
 * Suggested F8 capture label for a work id (no spaces).
 * @param {string} id
 * @param {string} [runHint]
 */
export function f8LabelFor(id, runHint = "") {
  const clean = String(id || "card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const run = String(runHint || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return run ? `pt-${clean}-${run}` : `pt-${clean}`;
}

/**
 * @param {string} statusMd
 * @returns {PlaytestCard[]}
 */
export function cardsFromStatus(statusMd) {
  /** @type {PlaytestCard[]} */
  const out = [];
  const seen = new Set();

  for (const q of parseStatusPlaytestQueue(statusMd)) {
    const blob = `${q.what} ${q.status}`;
    if (!blockedOnWyatt(blob) && !blockedOnWyatt(q.status)) continue;
    // Fully closed ✅ with PASS already filtered by blockedOnWyatt; still skip pure done without owed.
    if (q.state === "done" && !blockedOnWyatt(q.status) && !blockedOnWyatt(blob)) continue;
    // ✅ CLOSED without "needs/owed" — queueRowState marks done; blockedOnWyatt should be false.
    if (q.state === "locked") continue;

    const id = (q.id && extractWorkId(q.id)) || extractWorkId(q.what) || extractWorkId(q.status);
    if (!id || seen.has(id)) continue;
    // Multi-id cells like "HUD-FEED-1 · MENU-HINT-1" — emit one card per id if all owed together.
    const multi = String(q.id || q.what).match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g) || [id];
    const unique = [...new Set(multi)];
    for (const one of unique) {
      if (seen.has(one)) continue;
      seen.add(one);
      // Classify on the source cells, never on the generated `do` below.
      const { rig, via } = classifyRig(`${q.what || ""}\n${q.status || ""}`);
      const check = parseOwedCheck(q.status || "", one);
      if (!check.goal) check.goal = q.what || one;
      out.push({
        id: one,
        phase: "STATUS",
        title: unique.length > 1 ? `${one} (from ${q.what || q.id})` : q.what || one,
        do: check.goal,
        context: check.context,
        steps: check.steps,
        tail: check.tail,
        expect: `Say PASS in one line, or FAIL with which arena, which mode, and whether you were host.`,
        f8: f8LabelFor(one),
        source: "status",
        priority: q.state === "active" ? "active" : "waiting",
        rig,
        rigVia: via,
        requiresNote: true,
        notePrompt: "What did you try? What should have happened? What happened?",
      });
    }
  }

  for (const issue of parseStatusOpenIssues(statusMd)) {
    const st = issue.status || "";
    if (issueState(st) === "closed") continue;
    if (!blockedOnWyatt(st) && !blockedOnWyatt(`${issue.issue} ${st}`)) continue;
    const id = extractWorkId(issue.id) || extractWorkId(issue.issue);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const { rig, via } = classifyRig(`${issue.issue || ""}\n${st}`);
    const check = parseOwedCheck(st, id);
    if (!check.goal) check.goal = issue.issue || id;
    out.push({
      id,
      phase: "STATUS",
      title: issue.issue || id,
      do: check.goal,
      context: check.context,
      steps: check.steps,
      tail: check.tail,
      expect: "PASS only if the thing you were told to look for is gone on prod after a hard refresh.",
      f8: f8LabelFor(id),
      source: "status-issue",
      priority: "open",
      rig,
      rigVia: via,
      requiresNote: true,
      notePrompt: "Repro steps + what you saw.",
    });
  }

  return out;
}

/**
 * @param {string} backlogMd
 * @returns {PlaytestCard[]}
 */
export function cardsFromBacklog(backlogMd) {
  /** @type {PlaytestCard[]} */
  const out = [];
  const seen = new Set();

  for (const section of parseBacklogSections(backlogMd)) {
    for (const r of section.rows) {
      const pri = String(r.pri || r.priority || "").trim();
      if (/^done$/i.test(pri)) continue;

      // Engineering: Pri | Item | Notes — Tech debt: Pri | ID | Item | Notes
      const idCell = String(r.id || "").replace(/\*\*/g, "").trim();
      const itemCell = String(r.item || r.work || "").replace(/\*\*/g, "").trim();
      const notes = String(r.notes || r.outcome || "").replace(/\*\*/g, "").trim();
      if (!backlogRowOwesPlaytest(itemCell || idCell, notes)) continue;

      const fromItem = parseBacklogItem(itemCell);
      const id = extractWorkId(idCell) || fromItem.id || extractWorkId(notes);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const title = fromItem.title || itemCell || id;
      // Raw cells, so a `[solo]` / `[2pc]` tag in Item survives parseBacklogItem's
      // trailing-tag strip and the step list is visible to the keyword hint.
      const { rig, via } = classifyRig(`${r.item || r.work || ""}\n${r.notes || r.outcome || ""}`);
      const check = parseOwedCheck(String(r.notes || r.outcome || ""), id);
      if (!check.goal) check.goal = title;
      out.push({
        id,
        phase: section.title || "BACKLOG",
        title,
        do: check.goal,
        context: check.context,
        steps: check.steps,
        tail: check.tail,
        expect: "If it fails, say which arena, which mode, and whether you were host.",
        f8: f8LabelFor(id),
        source: "backlog",
        priority: pri || "?",
        rig,
        rigVia: via,
        requiresNote: true,
        notePrompt: "Pass/fail detail for the agent (one finding).",
      });
    }
  }

  return out;
}

/**
 * @param {{ statusMd: string, backlogMd: string, head?: string | null, generatedAt?: string }} opts
 * @returns {{ cards: PlaytestCard[], meta: { generatedAt: string, head: string | null, sources: string[] } }}
 */
export function buildPlaytestQueue(opts) {
  const statusCards = cardsFromStatus(opts.statusMd || "");
  const backlogCards = cardsFromBacklog(opts.backlogMd || "");

  /** @type {Map<string, PlaytestCard>} */
  const byId = new Map();
  // Status wins over backlog for the same id (fresher declaration) — except for
  // rig, which merges across both rows. ROUND-WEDGE-1 is the case: STATUS owns the
  // card, but its `[solo]` tag lives in the cheap place (BACKLOG), so a status-wins
  // overwrite would otherwise throw the tag away.
  for (const c of backlogCards) byId.set(c.id, c);
  for (const c of statusCards) {
    const prior = byId.get(c.id);
    if (!prior) {
      byId.set(c.id, c);
      continue;
    }
    // Cards carry the goal as `do`; mergeCheck works on the parsed shape.
    const asCheck = (card) => ({
      goal: card.do || "",
      context: card.context || "",
      steps: card.steps || [],
      tail: card.tail || "",
    });
    const priorCheck = asCheck(prior);
    const check = mergeCheck(priorCheck, asCheck(c));
    byId.set(c.id, {
      ...c,
      ...mergeRig(prior, c),
      do: check.goal,
      context: check.context,
      steps: check.steps,
      tail: check.tail,
      // The human checklist and the expectations wording travel together.
      expect: check === priorCheck ? prior.expect : c.expect,
    });
  }

  // Solo-checkable first, two-machine last, alphabetical inside each group — so a
  // sitting at one desk runs top-down and stops when the badge flips to 2 PC.
  const RIG_ORDER = { solo: 0, mp: 1 };
  const owed = [...byId.values()].sort(
    (a, b) => (RIG_ORDER[a.rig] ?? 0) - (RIG_ORDER[b.rig] ?? 0) || a.id.localeCompare(b.id),
  );

  /** @type {PlaytestCard[]} */
  const cards = [];
  if (owed.length > 0) {
    cards.push({
      id: "PREFLIGHT",
      phase: "SYS",
      title: "Open prod with diagnostics",
      do: "Get production open, on the current build, with diagnostics on.",
      context: "",
      steps: [
        "Open https://www.cartclash.lol/?diag=1",
        "Hard-refresh (Ctrl+Shift+R) until you are sure you are on the current build (HEAD should match origin/cart-clash).",
        "Check the console — no red errors on the menu.",
      ],
      tail: "The cards below are sorted so everything you can do at one desk comes first.",
      expect: "Menu loads, no boot errors, and you are ready to work down the list.",
      f8: f8LabelFor("preflight"),
      source: "system",
      priority: "sys",
      rig: "solo",
      rigVia: "tag",
      requiresNote: false,
    });
    cards.push(...owed);
    cards.push({
      id: "EXPORT",
      phase: "SYS",
      title: "Export this session to the agent",
      do: "Hand the results back so the fixes can start.",
      context: "",
      steps: [
        "Hit Copy report (or download the JSON).",
        "Paste it into chat.",
        "Say: one finding at a time — do not batch fixes.",
      ],
      tail: "",
      expect: "The agent comes back with a single next action, or one card to retest.",
      f8: f8LabelFor("export"),
      source: "system",
      priority: "sys",
      rig: "solo",
      rigVia: "tag",
      requiresNote: true,
      notePrompt: "Overall vs last session: better / same / worse? Worst moment?",
    });
  }

  return {
    cards,
    meta: {
      generatedAt: opts.generatedAt || new Date().toISOString(),
      head: opts.head ?? null,
      sources: ["STATUS.md active queue + open issues (blockedOnWyatt)", "BACKLOG.md Owed: Wyatt playtest", "system PREFLIGHT/EXPORT"],
      warnings: multiIssueWarnings(cards),
    },
  };
}
