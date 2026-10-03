import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        // Importing index.ts logs in to Discord with whatever token .env
        // holds, so no test may import it. Keep it to wiring and put anything
        // worth testing in a module that can be imported.
        'src/index.ts',
      ],
      reporter: ['text', 'html'],
      // A ratchet, set from what the suite achieved when coverage was first
      // measured, rounded down. Untested new code fails CI rather than
      // quietly lowering the bar. Raise these when coverage rises; lowering
      // them is a decision to make in review, not to slip through.
      thresholds: {
        statements: 96,
        branches: 91,
        functions: 96,
        lines: 98,
      },
    },
  },
});
