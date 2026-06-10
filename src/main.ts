import { createApp } from './app.js';

/**
 * Composition root (Spec 08 §5.2). Contains zero business logic: it constructs
 * production-side dependencies — defaulted here so the entry point in
 * `bin/p9r.ts` can call `main()` with no arguments — wires them, and runs the
 * app. Tests call it with injected fakes; the no-argument call is exercised by
 * the construction smoke test.
 */
export function main(
  argv: readonly string[] = process.argv.slice(2),
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): void {
  createApp({ argv, write }).run();
}
