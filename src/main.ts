import { createApp } from './app.js';
import { productionLaunch } from './adapters/launch.adapter.js';
import type { LaunchOptions } from './cli/args.js';

/**
 * Composition root (Spec 08 §5.2). Contains zero business logic: it wires the
 * production output sink and the real TUI launch (which constructs the cluster
 * adapters and renders Ink) and runs the app. Tests inject fakes; the
 * construction smoke test exercises the production defaults without launching.
 */
export function main(
  argv: readonly string[],
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
  launch: (options: LaunchOptions) => void = productionLaunch,
): void {
  createApp({ argv, write, launch }).run();
}
