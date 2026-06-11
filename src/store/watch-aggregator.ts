/**
 * Watch Aggregator (Spec 01 §3.2) — thin in-process pub/sub that fans
 * normalised ResourceEvents from one or more KubeClient watches out to
 * registered subscribers.
 *
 * The aggregator owns the WatchSubscription lifecycle: call `close()` to tear
 * down all active watches and remove all subscribers.
 */

import type { ResourceEvent } from '../core/types.js';
import type { KubeClient, WatchOptions } from '../boundaries/kube-client.js';

export type WatchAggregatorHandler = (event: ResourceEvent) => void;

export interface WatchAggregatorSubscription {
  /** Stop forwarding events to this handler. Idempotent. */
  unsubscribe(): void;
}

export interface WatchAggregatorWatch {
  /** Stop this watch and remove its WatchSubscription from the aggregator. */
  close(): void;
}

/**
 * WatchAggregator subscribes to KubeClient watch streams and fans events out
 * to all registered handlers. It normalises nothing itself — events are
 * forwarded as-is from the boundary.
 */
export class WatchAggregator {
  private readonly handlers = new Set<WatchAggregatorHandler>();

  /**
   * Open a watch on `client` for `kind` / `options` and forward every event to
   * all registered handlers. Returns a handle to close just this watch.
   */
  watch(
    client: KubeClient,
    kind: string,
    options: WatchOptions,
  ): WatchAggregatorWatch {
    const subscription = client.watch(kind, options, (event) => {
      for (const handler of this.handlers) {
        handler(event);
      }
    });
    return {
      close: () => {
        subscription.close();
      },
    };
  }

  /**
   * Register a handler to receive forwarded events. Returns a subscription
   * object whose `unsubscribe()` method removes the handler.
   */
  subscribe(handler: WatchAggregatorHandler): WatchAggregatorSubscription {
    this.handlers.add(handler);
    return {
      unsubscribe: () => {
        this.handlers.delete(handler);
      },
    };
  }
}
