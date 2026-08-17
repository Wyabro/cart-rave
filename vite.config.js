import { readdirSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

// * Build identity baked into the bundle (read via src/utils/buildInfo.js). Capture bundles,
// * crash beacons, and analytics batches all stamp this so a report is attributable to the
// * exact build it came from. Git absence (CI tarball, fresh clone states) degrades to "unknown".
function buildStamp() {
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    /* not a git checkout */
  }
  let version = null;
  try {
    version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version ?? null;
  } catch {
    /* unreadable package.json — version stays null */
  }
  return { version, sha, builtAt: new Date().toISOString() };
}

/**
 * Three's DRACOLoader embeds static decoder URLs that Vite emits into dist/assets/
 * even though runtime always calls setDecoderPath("/draco/gltf/") against public/.
 * Strip those orphan hashed files so deploy carries one decoder copy only.
 */
function stripOrphanDracoBuildAssets() {
  return {
    name: "strip-orphan-draco-build-assets",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        // * Bundle keys may be bare (`draco_…`) or under assets/ depending on Vite version.
        if (/(^|\/)draco_[^/]+$/.test(fileName)) delete bundle[fileName];
      }
    },
    closeBundle() {
      const assetsDir = join(process.cwd(), "dist", "assets");
      try {
        for (const name of readdirSync(assetsDir)) {
          if (/^draco_/.test(name)) unlinkSync(join(assetsDir, name));
        }
      } catch {
        /* dist/assets missing — dev-only build */
      }
    },
  };
}

/**
 * Write dist/.chunk-manifest.json — a module → chunk map straight from rolldown's own
 * bundle metadata. Code-split work (BUNDLE-1) otherwise gets verified by eyeballing the
 * build log; this makes "did src/hud.js actually leave the entry chunk?" a mechanical assert.
 *
 * Emitted through fs, NOT `this.emitFile`, on purpose: an emitted asset would join the
 * bundle and could perturb output hashing. Nothing here mutates `bundle`.
 * dist/ is gitignored, so the manifest never lands in git.
 */
function writeChunkManifest() {
  /** @type {{chunks: Record<string, string[]>, moduleToChunk: Record<string, string>} | null} */
  let manifest = null;
  return {
    name: "write-chunk-manifest",
    enforce: "post",
    /** @param {any} _options @param {Record<string, any>} bundle */
    generateBundle(_options, bundle) {
      /** @type {Record<string, string[]>} */
      const chunks = {};
      /** @type {Record<string, string>} */
      const moduleToChunk = {};
      for (const [fileName, out] of Object.entries(bundle)) {
        const moduleIds = out?.moduleIds;
        if (!Array.isArray(moduleIds)) continue;
        const rel = moduleIds
          .map((id) => String(id).replace(/\\/g, "/"))
          .map((id) => (id.startsWith(root) ? id.slice(root.length + 1) : id));
        chunks[fileName] = rel;
        for (const id of rel) moduleToChunk[id] = fileName;
      }
      manifest = { chunks, moduleToChunk };
    },
    closeBundle() {
      if (!manifest) return;
      try {
        writeFileSync(
          join(process.cwd(), "dist", ".chunk-manifest.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );
      } catch {
        /* dist/ missing — dev-only build */
      }
    },
  };
}

const root = process.cwd().replace(/\\/g, "/");

export default defineConfig(({ mode }) => ({
  plugins: [wasm(), stripOrphanDracoBuildAssets(), writeChunkManifest()],

  define: {
    __CC_BUILD__: JSON.stringify(buildStamp()),
  },

  // * Production ships the standard Rapier build only (SIMD is opt-in at runtime but
  // * broken on 0.19.3). Aliasing -simd → standard drops the duplicate ~1.6 MB wasm blob
  // * from dist while dev keeps both packages for ?rapier=simd testing.
  resolve: mode === "production" ? {
    alias: {
      "@dimforge/rapier3d-simd": "@dimforge/rapier3d",
    },
  } : undefined,

  // * Vitest-only: stub Rapier wasm packages so vite's import-analysis doesn't try
  // * to resolve the wasm-pack entry during unit tests (rapierInstance never initializes there).
  test: {
    alias: {
      "@dimforge/rapier3d-simd": new URL("./tests/stubs/rapier3d.js", import.meta.url).pathname,
      "@dimforge/rapier3d": new URL("./tests/stubs/rapier3d.js", import.meta.url).pathname,
    },
    // * Worktrees under .claude/ mirror the suite and double Vitest discovery — exclude them.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.claude/worktrees/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      // * Workers-pool suite — owned by vitest.config.js projects → party-do.
      "tests/party-do/**",
    ],
  },

  // Base public path when served in production
  base: "./",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // * No sourcemaps in the shipped bundle: dist/ is served whole by the Worker's ASSETS
    // * binding, so .map files (7.8 MB, full original source) would be publicly fetchable.
    sourcemap: false,
    // * Vendor libs (three, animejs, rapier) are deliberately kept as whole chunks below,
    // * so the default 500 kB warning is just noise — raise it above the largest vendor chunk.
    chunkSizeWarningLimit: 700,
    // Optimize for Three.js
    rolldownOptions: {
      output: {
        // * codeSplitting groups (authoritative) instead of manualChunks (hints): with
        // * manualChunks, rolldown folded three's core/module into the "animejs" chunk
        // * (animejs/adapters/three drags three into the graph), producing a 650 kB blob
        // * mislabeled "animejs". Ordered groups here keep three in its own cache line.
        codeSplitting: {
          groups: [
            // * One honest "three" chunk: core + examples/jsm addons version together and
            // * rolldown merges them regardless, so a single group keeps the name accurate.
            { name: "three", test: /node_modules[/\\]three[/\\]/ },
            // * Matches rapier3d and rapier3d-simd (SIMD is preferred at runtime).
            { name: "rapier", test: /node_modules[/\\]@dimforge[/\\]rapier3d(?:-simd)?[/\\]/ },
            { name: "howler", test: /node_modules[/\\]howler/ },
            { name: "animejs", test: /node_modules[/\\]animejs/ },
          ],
        },
      },
    },
  },

  server: {
    // * NOT 3000: Windows Hyper-V/HNS dynamic exclusions currently cover 2958–3057
    // * (bind fails EACCES). Same class as LOCAL_WORKER_PORT 8787→8899. Keep in
    // * sync with tools/lib/harness.mjs CLIENT_PORT.
    port: 4000,
    host: "127.0.0.1",
    open: true,
    // * Pre-transform entry files so first load is less likely to reset mid-flight.
    // * Paths follow the ui/ levels/ layout (menu lived at src/cart-rave-menu.js before).
    warmup: {
      clientFiles: [
        "./index.html",
        "./src/main.js",
        "./src/ui/cart-rave-menu.js",
        "./src/ui/styles/cart-rave-menu.css",
      ],
    },
    hmr: {
      timeout: 60000,
    },
  },

  // Good defaults for Three.js + future post-processing
  optimizeDeps: {
    include: [
      "three",
      "three/examples/jsm/renderers/CSS2DRenderer.js",
      "three/examples/jsm/postprocessing/EffectComposer.js",
      "three/examples/jsm/postprocessing/RenderPass.js",
      "three/examples/jsm/postprocessing/ShaderPass.js",
      "three/examples/jsm/postprocessing/UnrealBloomPass.js",
      "three/examples/jsm/shaders/FXAAShader.js",
      "three/examples/jsm/environments/RoomEnvironment.js",
      "three/examples/jsm/objects/Reflector.js",
      "three/examples/jsm/utils/BufferGeometryUtils.js",
      "animejs",
      "partysocket",
    ],
  },
}));
