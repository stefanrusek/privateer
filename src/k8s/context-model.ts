/**
 * Context model (Spec 01 §6) — pure data and state transitions for
 * Kubernetes context management. No I/O; tested 100% with unit tests.
 */

import type { KubeClient } from '../boundaries/kube-client.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';

export interface ContextSwitchError {
  message: string;
}

/**
 * ContextModel tracks the active context and emits a reinit signal when it
 * changes. All logic is pure — the signal is a callback injected at
 * construction time.
 */
export class ContextModel {
  private current: string;
  private readonly contexts: string[];
  private readonly onReinit: () => void;

  constructor(client: KubeClient, onReinit: () => void) {
    const ctxList = client.listContexts();
    this.contexts = ctxList.map((c) => c.name);
    this.current = client.currentContext();
    this.onReinit = onReinit;
  }

  listContexts(): string[] {
    return [...this.contexts];
  }

  currentContext(): string {
    return this.current;
  }

  switchContext(name: string): Result<void, ContextSwitchError> {
    if (!this.contexts.includes(name)) {
      return err({ message: `unknown context: ${name}` });
    }
    if (this.current === name) {
      return ok(undefined);
    }
    this.current = name;
    this.onReinit();
    return ok(undefined);
  }
}
