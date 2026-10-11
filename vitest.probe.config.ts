import { defineConfig } from 'vitest/config';

// Tuning probes: exploratory sweeps that print tables instead of asserting.
// npm run probe            (optionally DRIVES=1.5,3 in the environment)
export default defineConfig({
  test: { include: ['tests/probe/**/*.probe.ts'], environment: 'node', silent: false },
});
