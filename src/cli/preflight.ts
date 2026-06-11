import type { ProcessRunner } from '../boundaries/process-runner.js';
import { type Result, ok, err } from '../core/result.js';

export interface PreflightError {
  kind: 'kubectlMissing';
  message: string;
}

/**
 * Startup check that `kubectl` is available (Spec 01 §8 — p9r shells out to it
 * for port-forward). Returns a typed Result rather than throwing so the launch
 * path can surface a graceful error.
 */
export function checkKubectl(
  runner: ProcessRunner,
): Promise<Result<void, PreflightError>> {
  return new Promise((resolve) => {
    const handle = runner.spawn('kubectl', ['version', '--client']);
    // `onExit` fires exactly once (both the fake and the real child process),
    // so no double-resolve guard is needed.
    handle.onExit((code) => {
      resolve(
        code === 0
          ? ok(undefined)
          : err({
              kind: 'kubectlMissing',
              message:
                'kubectl not found on PATH — install it to enable port-forwarding.',
            }),
      );
    });
  });
}
