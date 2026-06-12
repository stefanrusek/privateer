/**
 * Delete action — confirmation message builder and execute helper.
 * Spec 05 §6.
 */

import type { KubeClient } from '../boundaries/kube-client.js';
import type { Result } from '../core/result.js';
import { err, ok } from '../core/result.js';

/** Kinds that cascade to pods and need the additional warning in the dialog. */
const CASCADE_KINDS = new Set(['Deployment', 'StatefulSet']);

/**
 * Build the inline confirmation message shown in the ConfirmDialog.
 * Deployment and StatefulSet get a cascade note; all other kinds get a simple
 * "Delete <name> in <namespace>?" message (Spec 05 §6.2).
 */
export function buildDeleteConfirmMessage(
  kind: string,
  name: string,
  namespace: string,
): string {
  if (CASCADE_KINDS.has(kind)) {
    return `This will remove the ${kind.toLowerCase()} and all its pods. Delete ${name} in ${namespace}?`;
  }
  return `Delete ${name} in ${namespace}?`;
}

/**
 * Execute a foreground delete via the KubeClient boundary.
 * Returns ok(undefined) on success, or err(message) on failure (Spec 05 §6.3).
 */
export async function executeDelete(
  client: KubeClient,
  kind: string,
  name: string,
  namespace: string,
): Promise<Result<void, string>> {
  const result = await client.delete(kind, name, namespace);
  if (!result.ok) {
    return err(result.error.message);
  }
  return ok(undefined);
}
