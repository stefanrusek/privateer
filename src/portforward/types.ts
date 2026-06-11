/**
 * Port-forward domain types (Spec 05 §5).
 */

/** Current lifecycle state of a single port-forward subprocess. */
export type ForwardStatus = 'starting' | 'active' | 'failed';

/** A single managed port-forward. */
export interface PortForward {
  readonly id: string;
  readonly podName: string;
  readonly namespace: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly status: ForwardStatus;
  /** Reason text shown in the manager when status is 'failed'. */
  readonly failReason?: string;
}

/** An entry in the recents list (last 10 previously-established forwards). */
export interface RecentForward {
  readonly podName: string;
  readonly namespace: string;
  readonly remotePort: number;
  readonly localPort: number;
}
