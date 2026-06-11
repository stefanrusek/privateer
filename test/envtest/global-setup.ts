import type { GlobalSetupContext } from 'vitest/node';
import { startEnvtest } from './server.js';
import { applyVendoredCrds } from './crds.js';

declare module 'vitest' {
  interface ProvidedContext {
    envtestServer: string;
    envtestToken: string;
  }
}

/**
 * Boot one shared envtest apiserver for the whole `@envtest` run, apply the
 * vendored CRDs, and expose the connection to test files via `inject(...)`.
 * Per-file isolation is achieved with a fresh namespace per file
 * (`freshNamespace`) rather than a server per worker.
 */
export default async function setup({
  provide,
}: GlobalSetupContext): Promise<() => void> {
  const env = await startEnvtest();
  applyVendoredCrds(env);
  provide('envtestServer', env.server);
  provide('envtestToken', env.token);
  return () => {
    env.stop();
  };
}
