import { defineConfig } from "vite";

export default defineConfig({
  // Base public path when served in production
  base: "./",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Optimize for Three.js
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/examples/jsm/")) {
            return "three-addons";
          }
          if (id.includes("node_modules/@dimforge/rapier3d-compat")) {
            return "rapier";
          }
          if (id.includes("node_modules/howler")) {
            return "howler";
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
      "@dimforge/rapier3d-compat",
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

  // Enable top-level await (useful for Rapier)
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
