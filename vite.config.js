import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

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

export default defineConfig(({ mode }) => ({
  plugins: [wasm(), stripOrphanDracoBuildAssets()],

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
  },

  // Base public path when served in production
  base: "./",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
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
    port: 3000,
    host: "127.0.0.1",
    open: true,
    // * Pre-transform entry files so first load is less likely to reset mid-flight.
    warmup: {
      clientFiles: [
        "./index.html",
        "./src/cart-rave-menu.js",
        "./src/main.js",
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
