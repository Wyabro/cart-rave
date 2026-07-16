#!/usr/bin/env node
// slice.mjs — split a long announcer session WAV into per-take chunks on silence,
// then emit a review.html for auditioning/assigning takes.
// Usage: node slice.mjs "<input.wav>" "<outDir>" [noiseDb] [minSilenceSec]

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const [, , inputPath, outDir, noiseDb = "-35", minSil = "0.5"] = process.argv;
if (!inputPath || !outDir) {
  console.error('Usage: node slice.mjs "<input.wav>" "<outDir>" [noiseDb] [minSilenceSec]');
  process.exit(1);
}

// ---- 1. total duration -------------------------------------------------------
const probe = spawnSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
], { encoding: "utf8" });
if (probe.status !== 0) { console.error(probe.stderr); process.exit(1); }
const totalDur = parseFloat(probe.stdout.trim());

// ---- 2. silence detection ----------------------------------------------------
const det = spawnSync("ffmpeg", [
  "-i", inputPath,
  "-af", `silencedetect=noise=${noiseDb}dB:d=${minSil}`,
  "-f", "null", "-",
], { encoding: "utf8" });
const log = det.stderr;

const silences = [];
let curStart = null;
for (const line of log.split(/\r?\n/)) {
  const s = line.match(/silence_start:\s*([\d.]+)/);
  const e = line.match(/silence_end:\s*([\d.]+)/);
  if (s) curStart = parseFloat(s[1]);
  if (e && curStart !== null) {
    silences.push([curStart, parseFloat(e[1])]);
    curStart = null;
  }
}
if (curStart !== null) silences.push([curStart, totalDur]);

// ---- 3. derive speech segments -----------------------------------------------
const PAD = 0.12; // seconds of context kept on each side
const segments = [];
let cursor = 0;
for (const [ss, se] of silences) {
  if (ss - cursor > 0.15) segments.push([Math.max(0, cursor - PAD), Math.min(totalDur, ss + PAD)]);
  cursor = se;
}
if (totalDur - cursor > 0.15) segments.push([Math.max(0, cursor - PAD), totalDur]);

console.log(`Detected ${silences.length} silence gaps -> ${segments.length} speech chunks`);

// ---- 4. extract chunks ---------------------------------------------------------
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (/^chunk_\d+\.wav$/.test(f)) rmSync(path.join(outDir, f));
}
mkdirSync(outDir, { recursive: true });

const index = [];
segments.forEach(([a, b], i) => {
  const name = `chunk_${String(i + 1).padStart(3, "0")}.wav`;
  const r = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", inputPath,
    "-ss", a.toFixed(3), "-to", b.toFixed(3),
    "-c:a", "pcm_s16le",
    path.join(outDir, name),
  ], { encoding: "utf8" });
  if (r.status !== 0) console.error(`chunk ${i + 1} FAILED: ${r.stderr}`);
  else index.push({ n: i + 1, file: name, start: +a.toFixed(2), dur: +(b - a).toFixed(2) });
});
writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));

// ---- 5. review page ------------------------------------------------------------
const TIER1_IDS = [
  "first_spill_01", "first_spill_02", "first_spill_03",
  "double_spill_01", "double_spill_02", "double_spill_03",
  "aisle_wipeout_01", "aisle_wipeout_02",
  "refund_01", "refund_02", "refund_03",
  "sudden_death_01", "victory_01", "defeat_01",
  "last_call_01", "last_call_02",
  "carnage_01", "carnage_02",
  "savage_01", "savage_02",
  "rampage_01", "rampage_02",
  "comeback_01", "comeback_02",
];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Announcer take review</title>
<style>
  :root{color-scheme:dark}
  body{font:14px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:1.2rem;max-width:960px}
  h1{font-size:1.1rem}
  table{border-collapse:collapse;width:100%}
  td,th{padding:.3rem .5rem;border-bottom:1px solid #2a2a2a;text-align:left;vertical-align:middle}
  tr.assigned{background:#15241a}
  tr.skipped{opacity:.42}
  audio{width:230px;height:30px}
  select{background:#1c1c1c;color:#eee;border:1px solid #444;border-radius:4px;padding:.15rem}
  button{background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:5px;padding:.25rem .6rem;cursor:pointer}
  button:hover{background:#3a3a3a}
  .best{accent-color:#4dff88;transform:scale(1.35)}
  #export{width:100%;height:9rem;background:#181818;color:#9f9;border:1px solid #444;margin-top:.6rem;font:12px monospace}
  .bar{position:sticky;top:0;background:#111;padding:.5rem 0;display:flex;gap:.6rem;align-items:center;border-bottom:1px solid #333;z-index:2}
  .hint{color:#999;font-size:12px}
</style></head><body>
<h1>Announcer Tier 1 — take review (${index.length} chunks)</h1>
<div class="bar">
  <button onclick="playAll()">▶ play all in order</button>
  <button onclick="exportJson()">⇩ export picks</button>
  <span class="hint">For each chunk: pick which line it is (or skip slates/junk), tick ★ on the keeper take for each line.</span>
</div>
<table id="t"><tr><th>#</th><th>audio</th><th>len</th><th>line</th><th></th><th>★ keeper</th></tr></table>
<textarea id="export" placeholder="export appears here — copy/paste it back to Claude"></textarea>
<script>
const chunks=${JSON.stringify(index)};
const IDS=${JSON.stringify(TIER1_IDS)};
const t=document.getElementById("t");
for(const c of chunks){
  const tr=document.createElement("tr");tr.id="row"+c.n;
  tr.innerHTML=\`<td>\${c.n}</td>
  <td><audio controls preload="none" src="\${c.file}"></audio></td>
  <td>\${c.dur.toFixed(1)}s</td>
  <td><select onchange="mark(\${c.n},this.value)">
    <option value="">— unassigned —</option>
    <option value="skip">skip (slate/junk)</option>
    \${IDS.map(i=>\`<option>\${i}</option>\`).join("")}
  </select></td>
  <td><button title="same line as previous row" onclick="samePrev(\${c.n})">= prev</button></td>
  <td><input type="checkbox" class="best" onchange="save()"></td>\`;
  t.appendChild(tr);
}
function mark(n,v){const r=document.getElementById("row"+n);r.className=v==="skip"?"skipped":v?"assigned":"";save();}
function samePrev(n){if(n<2)return;const p=document.querySelector("#row"+(n-1)+" select"),s=document.querySelector("#row"+n+" select");s.value=p.value;mark(n,s.value);}
function playAll(){let i=0;const as=[...document.querySelectorAll("audio")];function next(){if(i>=as.length)return;const a=as[i++];a.onended=next;a.play();}next();}
function collect(){return chunks.map(c=>{const r=document.getElementById("row"+c.n);return{chunk:c.n,file:c.file,line:r.querySelector("select").value||null,keeper:r.querySelector("input").checked};});}
function exportJson(){document.getElementById("export").value=JSON.stringify(collect().filter(x=>x.line&&x.line!=="skip"),null,1);}
function save(){localStorage.setItem("annoucerPicks",JSON.stringify(collect()));}
(function restore(){try{const d=JSON.parse(localStorage.getItem("annoucerPicks")||"[]");for(const x of d){const r=document.getElementById("row"+x.chunk);if(!r)continue;r.querySelector("select").value=x.line==null?"":x.line;r.querySelector("input").checked=!!x.keeper;mark(x.chunk,x.line==null?"":x.line);}}catch{}})();
</script></body></html>`;
writeFileSync(path.join(outDir, "review.html"), html);
console.log(`Wrote ${index.length} chunks + review.html to ${outDir}`);
