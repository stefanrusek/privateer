import { VERSION } from './version.js';

/**
 * Everything the application needs from the outside world, injected as plain
 * interfaces (Spec 08 §6.1). The walking skeleton needs only an output sink and
 * the parsed CLI arguments; later chunks widen this with the KubeClient,
 * MetricsSource, Clock, TTY, Lifecycle, etc. boundaries.
 */
export interface AppDeps {
  /** Sink for one-shot textual output (e.g. `p9r version`). */
  readonly write: (line: string) => void;
  /** CLI arguments, excluding the runtime and script path. */
  readonly argv: readonly string[];
}

export interface App {
  run(): void;
}

/**
 * Compose the application from its injected dependencies. Pure construction —
 * no I/O happens until `run()` is called, and even then only through `deps`.
 */
export function createApp(deps: AppDeps): App {
  return {
    run(): void {
      const [command] = deps.argv;
      if (command === 'version') {
        deps.write(`p9r ${VERSION}`);
        return;
      }
      deps.write('p9r — Privateer (TUI not yet implemented)');
    },
  };
}
