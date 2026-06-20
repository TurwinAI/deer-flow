import { defineConfig } from "vitest/config";

/**
 * Functions test config. Emulator-backed test files (label/persistence/rules/
 * storageRules/polar/autonomy) all share ONE Firestore emulator instance and
 * clean shared collections in `afterEach`. Vitest parallelizes across files by
 * default, which interleaves those writes/cleanups across files and produces
 * cross-file contention (e.g. one file's recorded orders leaking into another's
 * assertions). Run files SEQUENTIALLY in a single fork so each emulator test
 * file owns the DB for its duration. Offline unit files are unaffected.
 */
export default defineConfig({
  test: {
    // Only the TS sources under src/; never the compiled lib/ output.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "lib"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
