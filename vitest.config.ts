import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        // Boundary adapters (Spec 08 §5.1/§5.2) are thin wrappers over real
        // SDKs (@kubernetes/client-node, @huggingface/transformers, Bun.spawn).
        // They are exercised by the @envtest integration suite and the main.ts
        // smoke test, NOT by the unit run — so they are excluded structurally
        // here rather than with a forbidden coverage-ignore comment. All real
        // *logic* lives behind the boundary interfaces (src/k8s, src/store, …)
        // and stays at 100% unit coverage against the fakes.
        'src/adapters/**',
      ],
    },
  },
});
