import { defineConfig } from "vitest/config";

// Only the project's tests: local files under .claude may hold tests of their own.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
