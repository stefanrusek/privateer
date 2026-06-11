import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { randomUUID } from 'node:crypto';

/** Build an in-memory KubeConfig pointed at a running envtest apiserver. */
export function makeKubeConfig(server: string, token: string): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromOptions({
    clusters: [{ name: 'envtest', server, skipTLSVerify: true }],
    users: [{ name: 'admin', token }],
    contexts: [{ name: 'envtest', cluster: 'envtest', user: 'admin' }],
    currentContext: 'envtest',
  });
  return kc;
}

export function coreApi(server: string, token: string): CoreV1Api {
  return makeKubeConfig(server, token).makeApiClient(CoreV1Api);
}

/**
 * Create a uniquely-named namespace for per-file isolation (Spec 08 §5.3) and
 * return its name.
 */
export async function freshNamespace(api: CoreV1Api): Promise<string> {
  const name = `t-${randomUUID().slice(0, 8)}`;
  await api.createNamespace({ body: { metadata: { name } } });
  return name;
}
