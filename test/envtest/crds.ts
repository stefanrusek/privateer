import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnvtestServer } from './server.js';

function assetsKubectl(): string {
  const assets = process.env.KUBEBUILDER_ASSETS ?? '';
  return join(assets, 'kubectl');
}

const crdDir = fileURLToPath(new URL('../crds', import.meta.url));

/**
 * Apply the vendored CRD manifests (Strimzi, Doppler, Prometheus Operator) so
 * CRD discovery, Kafka/Doppler status resolvers, and sidebar grouping can be
 * tested against real schemas (Spec 08 §5.3).
 */
export function applyVendoredCrds(env: EnvtestServer): void {
  const result = spawnSync(
    assetsKubectl(),
    [
      `--server=${env.server}`,
      '--insecure-skip-tls-verify=true',
      `--token=${env.token}`,
      'apply',
      '-f',
      crdDir,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `failed to apply vendored CRDs: ${result.stderr || result.stdout}`,
    );
  }
}
