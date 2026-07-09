import fs from "fs";

const p = "src/config.js";
let s = fs.readFileSync(p, "utf8");

s = s.replace("toneMappingExposure: 0.38,", "toneMappingExposure: 0.4,");
s = s.replace(
  "intensity: 0.55, // unitless — global IBL multiplier (slightly down: less milky floors)",
  "intensity: 0.6, // unitless — global IBL multiplier",
);
s = s.replace(
  "materialEnvMapIntensity: 0.35, // unitless — base per-material reflectivity (× intensity)",
  "materialEnvMapIntensity: 0.4, // unitless — base per-material reflectivity (× intensity)",
);
s = s.replace(
  "strength: 0.14, // unitless — subtle composite (was 0.26/0.34 — too hot on LDR)",
  "strength: 0.34, // unitless — bloom composite intensity",
);
s = s.replace(
  "radius: 0.22, // unitless — tight halo (wide radius = foggy light blobs)",
  "radius: 0.34, // unitless — halo tightness (lower = crisper neon, higher = hazier)",
);
s = s.replace(
  "threshold: 0.94, // unitless — only true peaks (cart neon / fixture cores)",
  "threshold: 0.76, // unitless — luminance cutoff (higher = emissive-only bloom)",
);
s = s.replace(
  "smoothWidth: 0.05, // unitless — narrow knee so mid-bright panels don't bloom",
  "smoothWidth: 0.14, // unitless — soft knee on the high-pass (avoids hard cutoffs)",
);
s = s.replace(
  /    \/\/ \* Keep dark-arena identity[\s\S]*?stay low like HDR path\.\n/,
  "",
);
s = s.replace(
  /    \/\/ \* UnrealBloomPass — LDR profile[\s\S]*?only neon edges glow\.\n/,
  "    // * UnrealBloomPass tuning — HDR path (HalfFloat composer). See applyBloomSettings().\n",
);

fs.writeFileSync(p, s);
console.log({
  exposure: s.includes("toneMappingExposure: 0.4"),
  bloom: s.includes("strength: 0.34"),
  threshold: s.includes("threshold: 0.76"),
});
