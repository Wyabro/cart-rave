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
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },

  server: {
    port: 5173,
    open: true,
  },

  // Good defaults for Three.js + future post-processing
  optimizeDeps: {
    include: ["three", "@dimforge/rapier3d-compat"],
  },

  // Enable top-level await (useful for Rapier)
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
