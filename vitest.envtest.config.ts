import { defineConfig } from 'vitest/config';

/**
 * Integration tests against a real kube-apiserver (Spec 08 §8 step 5). Run
 * separately from the unit suite via `bun run test:envtest` — these are NOT
 * coverage-gated (the 100% rule applies to `src/**` unit code) and boot a live
 * control plane, so they get a generous timeout and a single global setup.
 */
export default defineConfig({
  test: {
    name: 'envtest',
    include: ['test/envtest/**/*.test.ts'],
    globalSetup: ['./test/envtest/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: { enabled: false },
  },
});
