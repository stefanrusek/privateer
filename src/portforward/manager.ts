/**
 * PortForwardManager — manages active kubectl port-forward subprocesses and
 * the recents list. Spec 05 §5.2–§5.7.
 *
 * Boundaries consumed:
 *   - ProcessRunner  — spawn `kubectl port-forward`
 *   - Lifecycle      — register SIGTERM cleanup hook
 */
import type {
  ProcessRunner,
  ProcessHandle,
} from '../boundaries/process-runner.js';
import type { Lifecycle } from '../boundaries/lifecycle.js';
import type { PortForward, RecentForward, ForwardStatus } from './types.js';

const MAX_RECENTS = 10;
const READY_SIGNAL = 'Forwarding from';

interface ManagedForward {
  forward: PortForward;
  handle: ProcessHandle;
}

export interface StartForwardParams {
  podName: string;
  namespace: string;
  remotePort: number;
  localPort: number;
}

export interface PortForwardManagerState {
  readonly forwards: readonly PortForward[];
  readonly recents: readonly RecentForward[];
}

/**
 * PortForwardManager: spawns and monitors kubectl port-forward subprocesses,
 * maintains recents, and cleans up on process exit.
 */
export class PortForwardManager {
  private managed = new Map<string, ManagedForward>();
  private recents: RecentForward[] = [];
  private nextId = 1;
  private readonly unregisterSignal: () => void;
  private changeHandlers: (() => void)[] = [];

  constructor(
    private readonly runner: ProcessRunner,
    lifecycle: Lifecycle,
  ) {
    this.unregisterSignal = lifecycle.onSignal(() => {
      this.terminateAll();
    });
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(handler: () => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      this.changeHandlers = this.changeHandlers.filter((h) => h !== handler);
    };
  }

  private notify(): void {
    for (const handler of [...this.changeHandlers]) {
      handler();
    }
  }

  private terminateAll(): void {
    for (const managed of this.managed.values()) {
      if (managed.handle.running) {
        managed.handle.terminate();
      }
    }
    this.unregisterSignal();
  }

  /** Start a new port-forward subprocess. Returns the assigned id. */
  start(params: StartForwardParams): string {
    const id = String(this.nextId++);

    const forward: PortForward = {
      id,
      podName: params.podName,
      namespace: params.namespace,
      remotePort: params.remotePort,
      localPort: params.localPort,
      status: 'starting',
    };

    const handle = this.runner.spawn('kubectl', [
      'port-forward',
      `pod/${params.podName}`,
      `${String(params.localPort)}:${String(params.remotePort)}`,
      '-n',
      params.namespace,
    ]);

    handle.onStdout((line) => {
      if (line.includes(READY_SIGNAL)) {
        this.updateStatus(id, 'active');
      }
    });

    handle.onStderr((line) => {
      this.setFailed(id, line.trim());
    });

    handle.onExit((code) => {
      const existing = this.managed.get(id);
      if (existing === undefined) {
        return;
      }
      if (
        existing.forward.status === 'active' ||
        existing.forward.status === 'starting'
      ) {
        const reason =
          code !== null ? `exited with code ${String(code)}` : 'terminated';
        this.setFailed(id, reason);
      }
    });

    this.managed.set(id, { forward, handle });
    this.notify();
    return id;
  }

  /** Stop (terminate) a forward by id. */
  stop(id: string): void {
    const managed = this.managed.get(id);
    if (managed === undefined) {
      return;
    }
    // Delete before terminating so that the onExit callback (which fires
    // synchronously in FakeProcessHandle) finds no entry and skips its
    // setFailed path, avoiding a spurious double-notify.
    this.managed.delete(id);
    if (managed.handle.running) {
      managed.handle.terminate();
    }
    this.notify();
  }

  /** Retry a failed forward: spawns a new subprocess with the same params. */
  retry(id: string): string | undefined {
    const managed = this.managed.get(id);
    if (managed === undefined) {
      return undefined;
    }
    const { forward } = managed;
    this.managed.delete(id);
    return this.start({
      podName: forward.podName,
      namespace: forward.namespace,
      remotePort: forward.remotePort,
      localPort: forward.localPort,
    });
  }

  private updateStatus(id: string, status: ForwardStatus): void {
    const managed = this.managed.get(id);
    if (managed === undefined) {
      return;
    }
    const { forward, handle } = managed;
    if (status === 'active') {
      // Add to recents when we first go active
      this.addRecent({
        podName: forward.podName,
        namespace: forward.namespace,
        remotePort: forward.remotePort,
        localPort: forward.localPort,
      });
    }
    this.managed.set(id, {
      forward: { ...forward, status },
      handle,
    });
    this.notify();
  }

  private setFailed(id: string, reason: string): void {
    const managed = this.managed.get(id);
    if (managed === undefined) {
      return;
    }
    const { forward, handle } = managed;
    this.managed.set(id, {
      forward: { ...forward, status: 'failed', failReason: reason },
      handle,
    });
    this.notify();
  }

  private addRecent(entry: RecentForward): void {
    // Remove duplicate if already present
    this.recents = this.recents.filter(
      (r) =>
        !(
          r.podName === entry.podName &&
          r.namespace === entry.namespace &&
          r.remotePort === entry.remotePort &&
          r.localPort === entry.localPort
        ),
    );
    this.recents.unshift(entry);
    if (this.recents.length > MAX_RECENTS) {
      this.recents = this.recents.slice(0, MAX_RECENTS);
    }
  }

  /** Current snapshot of all active forwards + recents. */
  getState(): PortForwardManagerState {
    return {
      forwards: [...this.managed.values()].map((m) => m.forward),
      recents: [...this.recents],
    };
  }

  /** Count of currently active (non-failed) forwards. */
  get activeCount(): number {
    let count = 0;
    for (const managed of this.managed.values()) {
      if (
        managed.forward.status === 'active' ||
        managed.forward.status === 'starting'
      ) {
        count++;
      }
    }
    return count;
  }
}
