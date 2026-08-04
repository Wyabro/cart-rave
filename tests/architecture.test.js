// architecture.test.js — the Living Architecture data layer: the file-claim resolver, the
// manifest digest, and the ARCH_* drift gates. The resolver's total-coverage guarantee is the
// liveness mechanism (an unmapped file is a hard gate), so these pin its exact behavior.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { SYSTEMS, EDGE_VIA, IMPORTANT_FILES } from "../tools/lib/archMap.mjs";
import { expandSystems, collectLineCounts, collectChurn, buildArchModel } from "../tools/lib/archModel.mjs";
import {
  buildArchManifest,
  assembleManifestBody,
  archSourceDigest,
  extractArchDigest,
} from "../tools/lib/archRender.mjs";
import {
  validateArchitectureMap,
  validateArchitectureFreshness,
  evaluateProjectHealth,
} from "../tools/lib/projectHealthValidation.mjs";

const cwd = process.cwd();

/** Build a throwaway src/ party/ shared/ tree and return its root; cleaned up in afterAll. */
const tmpRoots = [];
function scratchTree(files) {
  const root = mkdtempSync(join(tmpdir(), "archtest-"));
  tmpRoots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body ?? "x\ny\n");
  }
  return root;
}
afterAll(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
});

describe("expandSystems resolver", () => {
  it("exact-path claim beats a dir-prefix claim (no duplicate)", async () => {
    const root = scratchTree({
      "src/a.js": null,
      "src/special.js": null,
    });
    const systems = [
      { id: "prefixer", members: ["src/"], edges: [], entry: [], notes: [] },
      { id: "exacter", members: ["src/special.js"], edges: [], entry: [], notes: [] },
    ];
    const r = await expandSystems(root, systems);
    expect(r.duplicates).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.bySystem.get("exacter")).toEqual(["src/special.js"]);
    expect(r.bySystem.get("prefixer")).toEqual(["src/a.js"]);
  });

  it("flags a file claimed by two same-kind claims as a duplicate", async () => {
    const root = scratchTree({ "src/dup.js": null });
    const systems = [
      { id: "one", members: ["src/dup.js"], edges: [], entry: [], notes: [] },
      { id: "two", members: ["src/dup.js"], edges: [], entry: [], notes: [] },
    ];
    const r = await expandSystems(root, systems);
    expect(r.duplicates).toEqual([{ file: "src/dup.js", systems: ["one", "two"] }]);
    expect(r.bySystem.get("one")).toEqual([]);
  });

  it("flags a two-prefix collision as a duplicate too", async () => {
    const root = scratchTree({ "src/ui/x.js": null });
    const systems = [
      { id: "a", members: ["src/"], edges: [], entry: [], notes: [] },
      { id: "b", members: ["src/ui/"], edges: [], entry: [], notes: [] },
    ];
    const r = await expandSystems(root, systems);
    expect(r.duplicates).toEqual([{ file: "src/ui/x.js", systems: ["a", "b"] }]);
  });

  it("reports a real file no system claims as unmapped", async () => {
    const root = scratchTree({ "src/claimed.js": null, "src/lonely.js": null });
    const systems = [{ id: "s", members: ["src/claimed.js"], edges: [], entry: [], notes: [] }];
    const r = await expandSystems(root, systems);
    expect(r.unmapped).toEqual(["src/lonely.js"]);
  });

  it("reports a map path (exact or prefix) that no longer exists as missing", async () => {
    const root = scratchTree({ "src/here.js": null });
    const systems = [
      { id: "s", members: ["src/here.js", "src/gone.js", "src/deadDir/"], edges: [], entry: [], notes: [] },
    ];
    const r = await expandSystems(root, systems);
    expect(r.missing).toEqual(["src/deadDir/", "src/gone.js"]);
  });

  it("only counts .js/.ts/.css/.d.ts and walks nested dirs", async () => {
    const root = scratchTree({
      "src/keep.js": null,
      "src/style.css": null,
      "src/types.d.ts": null,
      "party/srv.ts": null,
      "shared/p.js": null,
      "src/skip.md": null,
      "src/nested/deep/x.js": null,
    });
    const systems = [{ id: "all", members: ["src/", "party/", "shared/"], edges: [], entry: [], notes: [] }];
    const r = await expandSystems(root, systems);
    expect(r.files).toEqual([
      "party/srv.ts",
      "shared/p.js",
      "src/keep.js",
      "src/nested/deep/x.js",
      "src/style.css",
      "src/types.d.ts",
    ]);
    expect(r.unmapped).toEqual([]);
  });
});

describe("live taxonomy covers the whole tree (the liveness guarantee)", () => {
  it("every real src/ party/ shared/ file is claimed exactly once", async () => {
    const r = await expandSystems(cwd, SYSTEMS);
    expect(r.unmapped).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.duplicates).toEqual([]);
    const claimed = [...r.bySystem.values()].reduce((n, files) => n + files.length, 0);
    expect(claimed).toBe(r.files.length);
    expect(r.files.length).toBeGreaterThan(150);
  });
});

describe("archMap taxonomy shape", () => {
  it("has 18 systems with unique ids and well-formed edges", () => {
    expect(SYSTEMS).toHaveLength(18);
    const ids = new Set(SYSTEMS.map((s) => s.id));
    expect(ids.size).toBe(18);
    for (const s of SYSTEMS) {
      expect(Array.isArray(s.members)).toBe(true);
      expect(s.members.length).toBeGreaterThan(0);
      for (const e of s.edges) {
        expect(EDGE_VIA).toContain(e.via); // via is in the enum
        expect(ids.has(e.to)).toBe(true); // edge points at a real system
        expect(typeof e.detail).toBe("string");
      }
    }
  });
});

describe("buildArchModel combines coverage + stats", () => {
  it("returns expansion + per-file line counts + churn against the real tree", async () => {
    const model = await buildArchModel(cwd, SYSTEMS, { sinceDays: 3650 });
    expect(model.expansion.unmapped).toEqual([]);
    // Every claimed file has a line-count entry (a number, or null if unreadable).
    const someFile = model.expansion.files[0];
    expect(Object.prototype.hasOwnProperty.call(model.lineCounts, someFile)).toBe(true);
    // In a real repo checkout churn is non-null and carries the per-system rollup.
    if (model.churn) {
      expect(model.churn.perSystem).toBeTruthy();
      expect(Object.keys(model.churn.perSystem)).toContain("boot-and-orchestration");
    }
  });
});

describe("stat collectors degrade gracefully", () => {
  it("collectLineCounts returns per-file counts and null on a missing file", async () => {
    const root = scratchTree({ "src/three.js": "a\nb\nc\n" });
    const counts = await collectLineCounts(root, ["src/three.js", "src/missing.js"]);
    expect(counts["src/three.js"]).toBe(4); // trailing newline → 4 split parts
    expect(counts["src/missing.js"]).toBeNull();
  });

  it("collectChurn returns null when git has no history for the path (never throws)", () => {
    const root = scratchTree({ "src/x.js": null });
    // A fresh temp dir is not a git repo → git fails → null, not a throw.
    expect(collectChurn(root, { sinceDays: 30 })).toBeNull();
  });
});

describe("manifest digest determinism", () => {
  it("two builds of the same tree/docs yield the same source_digest", async () => {
    const a = await buildArchManifest(cwd, { at: "2020-01-01T00:00:00.000Z", commit: "aaaaaaa" });
    const b = await buildArchManifest(cwd, { at: "2026-07-21T00:00:00.000Z", commit: "bbbbbbb" });
    // Different generated headers, identical structural digest → `generated` is excluded.
    expect(a.generated.commit).not.toBe(b.generated.commit);
    expect(a.source_digest).toBe(b.source_digest);
    expect(extractArchDigest(JSON.stringify(a))).toBe(a.source_digest);
  });

  it("a taxonomy change flips the digest", async () => {
    const a = await buildArchManifest(cwd, {});
    const bodyA = { ...a };
    delete bodyA.generated;
    delete bodyA.source_digest;
    const mutated = structuredClone(bodyA);
    mutated.systems[0].name = `${mutated.systems[0].name} (changed)`;
    expect(archSourceDigest(mutated)).not.toBe(a.source_digest);
  });

  it("line counts and churn never enter the manifest or its digest", async () => {
    const m = await buildArchManifest(cwd, {});
    const text = JSON.stringify(m);
    for (const forbidden of ["linesChanged", "lineCount", '"churn"', '"adds"', '"dels"', "hotFiles"]) {
      expect(text).not.toContain(forbidden);
    }
    // Every system carries files[] + file_count (structural, IN the digest) but no stats.
    for (const s of m.systems) {
      expect(Array.isArray(s.files)).toBe(true);
      expect(s.file_count).toBe(s.files.length);
      expect(s).not.toHaveProperty("lines");
    }
  });

  it("assembleManifestBody digest ignores the generated header by construction", () => {
    const body = assembleManifestBody({
      expansion: { bySystem: new Map(SYSTEMS.map((s) => [s.id, []])) },
      statusMd: "", agentsMd: "", backlogMd: "", ship1Md: "", projectStateMd: "",
    });
    const d1 = archSourceDigest({ ...body, generated: { at: "x" }, source_digest: "zzzz" });
    const d2 = archSourceDigest({ ...body, generated: { at: "y" }, source_digest: "wwww" });
    expect(d1).toBe(d2);
  });
});

describe("ARCH_* drift gates", () => {
  it("validateArchitectureMap emits UNMAPPED / MISSING / DUPLICATE codes", () => {
    const findings = validateArchitectureMap({
      unmapped: ["src/new.js"],
      missing: ["src/gone.js"],
      duplicates: [{ file: "src/dup.js", systems: ["a", "b"] }],
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("ARCH_UNMAPPED_FILE");
    expect(codes).toContain("ARCH_MISSING_FILE");
    expect(codes).toContain("ARCH_DUPLICATE_CLAIM");
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    expect(findings[0].message).toContain("tools/lib/archMap.mjs");
    expect(findings[0].message).toContain("src/new.js");
  });

  it("validateArchitectureMap is silent on a fully-mapped tree", () => {
    expect(validateArchitectureMap({ unmapped: [], missing: [], duplicates: [] })).toEqual([]);
  });

  it("validateArchitectureFreshness: missing → ARCH_MISSING, drift → ARCH_STALE, match → []", () => {
    const codes = (fs) => fs.map((f) => f.code);
    expect(codes(validateArchitectureFreshness("", "abc12345"))).toEqual(["ARCH_MISSING"]);
    const stale = `{ "source_digest": "deadbeef" }`;
    expect(codes(validateArchitectureFreshness(stale, "abc12345"))).toEqual(["ARCH_STALE"]);
    const fresh = `{ "source_digest": "abc12345" }`;
    expect(validateArchitectureFreshness(fresh, "abc12345")).toEqual([]);
  });

  it("evaluateProjectHealth threads archInput through both arch gates", () => {
    const statusMd = "## Current focus\n\nx\n\n### Release phases\n\n- ▶ Playtesting & stabilization\n\n### Do not\n\n- x\n";
    const errors = (r) => r.findings.filter((f) => f.severity === "error").map((f) => f.code);
    const bad = evaluateProjectHealth({
      statusMd,
      archInput: {
        expansion: { unmapped: ["src/orphan.js"], missing: [], duplicates: [] },
        archJsonText: "",
        liveDigest: "abcd1234",
      },
    });
    expect(errors(bad)).toContain("ARCH_UNMAPPED_FILE");
    expect(errors(bad)).toContain("ARCH_MISSING");

    const good = evaluateProjectHealth({
      statusMd,
      archInput: {
        expansion: { unmapped: [], missing: [], duplicates: [] },
        archJsonText: `{ "source_digest": "abcd1234" }`,
        liveDigest: "abcd1234",
      },
    });
    expect(errors(good).filter((c) => c.startsWith("ARCH_"))).toEqual([]);
  });

  it("omitting archInput skips the arch gates entirely (pure-STATUS callers stay usable)", () => {
    const statusMd = "## Current focus\n\nx\n\n### Release phases\n\n- ▶ Playtesting & stabilization\n\n### Do not\n\n- x\n";
    const r = evaluateProjectHealth({ statusMd });
    expect(r.findings.every((f) => !f.code.startsWith("ARCH_"))).toBe(true);
  });
});

// * ARCH-DRIFT-1. control-flow.md and archMap.mjs used to cite code by line number, and every
// * one of them had drifted (main.js:314 → a comment, main.js:4748 → an unrelated guard). Line
// * refs cannot be kept honest by review, so they are banned outright: a code citation is a
// * symbol string that must literally exist in the file it points at. These two tests are what
// * make that stick — a rename fails the suite instead of quietly rotting the doc.
describe("control-flow.md symbol anchors resolve", () => {
  const repoRoot = new URL("../", import.meta.url);
  const docUrl = new URL("docs/reference/control-flow.md", repoRoot);
  const docText = readFileSync(docUrl, "utf8");

  /** Markdown links into src/ · party/ · shared/ whose text is a backticked symbol. */
  function symbolAnchors() {
    const out = [];
    for (const m of docText.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
      const [, rawText, href] = m;
      const target = href.replace(/^(?:\.\.\/)+/, "");
      if (!/^(src|party|shared)\//.test(target)) continue;
      const text = rawText.replace(/`/g, "").trim();
      // * Link text that is just the path is a file reference, not a symbol anchor.
      if (text.includes("/") || /\.(js|ts|mjs)$/.test(text)) continue;
      out.push({ symbol: text, target });
    }
    return out;
  }

  it("every anchored symbol exists in the file it points at", () => {
    const anchors = symbolAnchors();
    // * Guard against the regex silently matching nothing and the test passing vacuously.
    expect(anchors.length).toBeGreaterThan(15);

    const broken = [];
    for (const { symbol, target } of anchors) {
      let body;
      try {
        body = readFileSync(new URL(target, repoRoot), "utf8");
      } catch {
        broken.push(`${target} — file does not exist (anchor \`${symbol}\`)`);
        continue;
      }
      if (!body.includes(symbol)) broken.push(`${target} — no match for \`${symbol}\``);
    }
    expect(broken).toEqual([]);
  });

  it("cites code by symbol only — no line numbers to drift", () => {
    const offenders = [];
    docText.split("\n").forEach((line, i) => {
      if (/[\w./-]+\.(?:js|ts|mjs):\d+/.test(line) || /~?\blines?\s+\d/i.test(line)) {
        offenders.push(`${i + 1}: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});

describe("archMap.mjs prose cites code by symbol, not line number", () => {
  it("no system note, edge detail, or file role carries a line reference", () => {
    const offenders = [];
    const check = (where, text) => {
      if (typeof text !== "string") return;
      if (/[\w./-]+\.(?:js|ts|mjs)\s*[:~]?\s*\d{2,}/.test(text) || /~?\blines?\s+\d/i.test(text)) {
        offenders.push(`${where}: ${text.slice(0, 90)}`);
      }
    };
    for (const s of SYSTEMS) {
      (s.notes ?? []).forEach((n, i) => check(`${s.id}.notes[${i}]`, n));
      (s.edges ?? []).forEach((e, i) => check(`${s.id}.edges[${i}].detail`, e.detail));
    }
    for (const f of IMPORTANT_FILES) check(`file ${f.path}`, f.role);
    expect(offenders).toEqual([]);
  });
});

describe("committed docs/ARCHITECTURE.json exists and is well-formed", () => {
  // * Freshness (digest matches live sources) is enforced by `npm run health:check`
  // * (ARCH_STALE), which runs AFTER `npm run arch` regenerates in the qa chain — mirroring
  // * how BRIEFING.md freshness is gated. This canary stays existence-only so an ordinary
  // * doc edit doesn't fail the `test` step before `arch` has had a chance to self-heal.
  it("exists and carries an 8-hex source digest", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../docs/ARCHITECTURE.json", import.meta.url), "utf8");
    expect(extractArchDigest(text)).toMatch(/^[0-9a-f]{8}$/);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
