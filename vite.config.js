import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm()],

  // * Vitest-only: stub the Rapier wasm package so vite's import-analysis doesn't try
  // * to resolve the wasm-pack entry during unit tests (rapierInstance never initializes there).
  test: {
    alias: {
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
        manualChunks(id) {
          if (id.includes("node_modules/three/examples/jsm/")) {
            return "three-addons";
          }
          if (id.includes("node_modules/@dimforge/rapier3d")) {
            return "rapier";
          }
          if (id.includes("node_modules/howler")) {
            return "howler";
          }
          if (id.includes("node_modules/animejs")) {
            return "animejs";
          }
          if (id.includes("node_modules/three")) {
            return "three";
          }
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
});
