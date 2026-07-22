// Workers Vitest project for CartRaveServer DO harness (A5b / SRV-TEST-1).
// Runs inside workerd via @cloudflare/vitest-pool-workers — keep out of the Node unit suite.

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    name: "party-do",
    include: ["tests/party-do/**/*.test.js"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.claude/worktrees/**",
    ],
  },
});
