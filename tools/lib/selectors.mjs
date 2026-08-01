/**
 * selectors.mjs — pure CSS selector-list parsing for the interactive-state sweep
 * (`tools/states.mjs`, FIGHT-VERIFY-1 Phase B).
 *
 * `tools/states.mjs` does not carry a hand-written list of hover/press/focus selectors: it
 * enumerates them from the LIVE CSSOM at runtime, so a deleted rule shows up as a zero-match
 * failure instead of a silent pass, and a newly added rule is swept for free. That makes the
 * parsing below load-bearing — every selector in the repo flows through it, and a parser bug
 * silently drops coverage rather than failing loudly. Hence: no side effects, no browser
 * globals, one export surface, and `tests/stateSelectors.test.js` pins it against the REAL
 * selector strings from `src/**\/*.css`.
 *
 * Three things the naive version gets wrong, in order of how badly:
 *
 *  1. **Splitting `selectorText` on `,` is unsafe.** `:is(.a, .b)` / `:not(.a, .b)` /
 *     `[data-x="a,b"]` all carry commas that are not list separators. As of 2026-07-31 the
 *     repo has ZERO of these — the plan claimed `cart-rave-menu.css:529` and `:1771` were live
 *     cases, and they are not: they are CHAINED single-argument `:not()`s
 *     (`.cr-level-btn:hover:not(.cr-level-btn--disabled)`,
 *     `.cr-customize-tab:hover:not(.active):not(.cr-customize-tab--soon)`). The depth-aware
 *     split is kept anyway, and the synthetic cases are unit-tested, because the cost is ~15
 *     lines and the failure mode of the naive version is silent under-coverage.
 *
 *  2. **The state pseudo is not always on the rightmost compound.** `.cr-cmd:hover
 *     .cr-btn-label` (`cart-rave-menu.css:3405`) hovers the ROW and repaints the LABEL. The
 *     element to drive and the element whose style changes are different nodes, so the parse
 *     yields both: `queryBase` (drive this) and `declaredOn` (the delta is declared here).
 *
 *  3. **`:hover` inside `:not(…)` is not a state to drive.** The scanner treats a functional
 *     pseudo as one opaque token, so `:not(:hover)` contributes nothing and survives stripping
 *     intact.
 */

/** The three interactive states this toolkit drives. Order is the montage's column order. */
export const STATE_PSEUDOS = ["hover", "active", "focus-visible"];

/** Cheap pre-filter for "does this selector text mention a state at all". */
export const STATE_RE = /:(hover|active|focus-visible)(?![-\w(])/;

/**
 * Split a selector list on TOP-LEVEL commas only — commas nested inside `(…)`, `[…]` or a
 * quoted string stay put.
 *
 * @param {string} selectorText A `CSSStyleRule.selectorText`.
 * @returns {string[]} Trimmed, non-empty individual selectors.
 */
export function splitSelectorList(selectorText) {
  const s = String(selectorText ?? "");
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Split one complex selector into compounds + the combinator that precedes each.
 *
 * @param {string} sel
 * @returns {{ combinator: "" | " " | ">" | "+" | "~", text: string }[]}
 */
export function splitCompounds(sel) {
  const s = String(sel ?? "").trim();
  /** @type {{ combinator: any, text: string }[]} */
  const out = [];
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  let cur = "";
  let pending = "";
  const flush = () => {
    if (cur.trim()) {
      out.push({ combinator: pending, text: cur.trim() });
      cur = "";
    }
  };
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\\") {
      cur += ch + (s[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") {
      depth += 1;
      cur += ch;
      continue;
    }
    if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      const nx = s[j];
      if (nx === ">" || nx === "+" || nx === "~") {
        flush();
        pending = nx;
        i = j;
        continue;
      }
      // * TRAILING whitespace after an explicit combinator is not a descendant combinator.
      // * In `a ~ b` the space at index 3 arrives with `cur` empty and `pending` already
      // * "~"; downgrading it to " " here silently turns every spaced `>`/`+`/`~` into a
      // * descendant selector, which queries a strictly wider set than the rule matches.
      if (!cur.trim() && pending) continue;
      flush();
      pending = " ";
      continue;
    }
    if (depth === 0 && (ch === ">" || ch === "+" || ch === "~")) {
      flush();
      pending = ch;
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

/** Rejoin what {@link splitCompounds} produced. */
export function joinCompounds(parts) {
  return parts
    .map((p, i) => (i === 0 ? p.text : `${p.combinator === " " ? " " : ` ${p.combinator} `}${p.text}`))
    .join("");
}

/**
 * Break one compound into its type/class/id/attribute head plus its ordered pseudo tokens.
 * A functional pseudo (`:not(…)`, `:is(…)`, `:nth-child(…)`) is ONE opaque token, arguments
 * included — that is what keeps `:not(:hover)` from registering as a drivable hover state.
 *
 * @param {string} text
 * @returns {{ head: string, parts: { kind: "class" | "element", name: string, raw: string }[] }}
 */
export function scanCompound(text) {
  const s = String(text ?? "");
  let head = "";
  /** @type {{ kind: "class" | "element", name: string, raw: string }[]} */
  const parts = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") {
      head += ch + (s[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "[") {
      let d = 0;
      const start = i;
      for (; i < s.length; i += 1) {
        const c = s[i];
        if (c === "[") d += 1;
        else if (c === "]") {
          d -= 1;
          if (d === 0) {
            i += 1;
            break;
          }
        }
      }
      head += s.slice(start, i);
      continue;
    }
    if (ch === ":") {
      const isElement = s[i + 1] === ":";
      let j = i + (isElement ? 2 : 1);
      let name = "";
      while (j < s.length && /[-\w]/.test(s[j])) {
        name += s[j];
        j += 1;
      }
      if (s[j] === "(") {
        let d = 0;
        for (; j < s.length; j += 1) {
          const c = s[j];
          if (c === "(") d += 1;
          else if (c === ")") {
            d -= 1;
            if (d === 0) {
              j += 1;
              break;
            }
          }
        }
      }
      // * The legacy one-colon spellings ARE pseudo-elements and cannot be queried either.
      const legacyElement = !isElement && ["before", "after", "first-line", "first-letter"].includes(name.toLowerCase());
      parts.push({
        kind: isElement || legacyElement ? "element" : "class",
        name: name.toLowerCase(),
        raw: s.slice(i, j),
      });
      i = j;
      continue;
    }
    head += ch;
    i += 1;
  }
  return { head, parts };
}

/**
 * Parse one selector that carries at least one interactive-state pseudo.
 *
 * @param {string} sel One entry from {@link splitSelectorList}.
 * @returns {null | {
 *   selector: string,
 *   state: string,
 *   states: string[],
 *   multiState: boolean,
 *   queryBase: string,
 *   fullBase: string,
 *   declaredOn: string,
 *   pseudoElement: string | null,
 *   descendantDelta: boolean,
 * }} `null` when the selector carries no drivable state pseudo (e.g. the
 *   `button.gamepad-focused` half of `loadingScreen.css`'s ring rule).
 */
export function parseStateSelector(sel) {
  const compounds = splitCompounds(sel);
  if (!compounds.length) return null;
  const scanned = compounds.map((c) => ({ ...c, ...scanCompound(c.text) }));

  /** @type {string[]} */
  const states = [];
  let stateIndex = -1;
  for (let i = 0; i < scanned.length; i += 1) {
    for (const p of scanned[i].parts) {
      if (p.kind === "class" && STATE_PSEUDOS.includes(p.name)) {
        states.push(p.name);
        stateIndex = i;
      }
    }
  }
  if (stateIndex < 0) return null;

  /** Drop every pseudo-ELEMENT (unqueryable) and, optionally, the state pseudo-classes. */
  const strip = (c) => {
    const kept = c.parts.filter((p) => p.kind !== "element" && !STATE_PSEUDOS.includes(p.name));
    return `${c.head}${kept.map((p) => p.raw).join("")}` || "*";
  };
  const rebuild = (upto) =>
    joinCompounds(scanned.slice(0, upto + 1).map((c) => ({ combinator: c.combinator, text: strip(c) })));

  const lastPseudoEl = scanned[scanned.length - 1].parts.filter((p) => p.kind === "element").pop();

  return {
    selector: String(sel).trim(),
    // * The LAST state pseudo wins as the primary: in `.a:hover .b:active` the thing being
    // * driven at the end of the chain is what the rule is really keyed on.
    state: states[states.length - 1],
    states,
    multiState: new Set(states).size > 1,
    // * Drive THIS. Everything up to and including the compound that carries the state.
    queryBase: rebuild(stateIndex),
    // * Reachability is asserted on the WHOLE selector: `.cr-cmd .cr-btn-label` failing to
    // * match is a different (and more interesting) fact than `.cr-cmd` failing to match.
    fullBase: rebuild(scanned.length - 1),
    // * Informational: which compound the declarations actually land on.
    declaredOn: strip(scanned[scanned.length - 1]),
    pseudoElement: lastPseudoEl ? lastPseudoEl.raw : null,
    descendantDelta: stateIndex < scanned.length - 1,
  };
}

/**
 * Parse a whole `CSSStyleRule.selectorText` into its drivable state selectors.
 *
 * @param {string} selectorText
 * @returns {{ parsed: ReturnType<typeof parseStateSelector>[], skipped: string[] }}
 *   `skipped` holds list entries with no state pseudo — normal (mixed rules exist), but the
 *   caller prints the count so a parser regression can't hide as "nothing to do".
 */
export function parseRuleSelectors(selectorText) {
  const parsed = [];
  const skipped = [];
  for (const one of splitSelectorList(selectorText)) {
    const p = parseStateSelector(one);
    if (p) parsed.push(p);
    else skipped.push(one);
  }
  return { parsed, skipped };
}
