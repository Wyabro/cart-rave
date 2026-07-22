// Root Vitest config (Vitest 4): multi-project via test.projects.
// - unit: Node / happy-dom suite (Rapier stubbed)
// - party-do: Workers pool against CartRaveServer (vitest.party.config.js)

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rapierStub = fileURLToPath(new URL("./tests/stubs/rapier3d.js", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@dimforge/rapier3d-simd": rapierStub,
            "@dimforge/rapier3d": rapierStub,
          },
        },
        test: {
          name: "unit",
          include: ["tests/**/*.test.js"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.claude/worktrees/**",
            "**/cypress/**",
            "**/.{idea,git,cache,output,temp}/**",
            "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
            "tests/party-do/**",
          ],
        },
      },
      "./vitest.party.config.js",
    ],
  },
});
