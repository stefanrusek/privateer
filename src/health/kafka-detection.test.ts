/**
 * Unit tests for kafka-detection.ts (Spec 06 §7).
 */
import { describe, it, expect } from 'vitest';
import {
  detectStrimzi,
  detectBareKafka,
  detectZooKeeper,
  detectKafka,
  getKafkaBrokerCount,
} from './kafka-detection.js';
import { makeStore, seedResource, TEST_CONTEXT } from './test-helpers.js';

// ---------------------------------------------------------------------------
// detectStrimzi
// ---------------------------------------------------------------------------

describe('detectStrimzi', () => {
  it('returns false when no CRDs in store', () => {
    const store = makeStore();
    expect(detectStrimzi(store, TEST_CONTEXT)).toBe(false);
  });

  it('returns true when CRD with group kafka.strimzi.io exists', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'kafkas.kafka.strimzi.io',
        null,
        {
          apiVersion: 'apiextensions.k8s.io/v1',
          kind: 'CustomResourceDefinition',
          spec: { group: 'kafka.strimzi.io', names: { kind: 'Kafka' } },
        },
      );
    });
    expect(detectStrimzi(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns false when CRD with different group', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'something.other.io',
        null,
        {
          spec: { group: 'other.io' },
        },
      );
    });
    expect(detectStrimzi(store, TEST_CONTEXT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectBareKafka
// ---------------------------------------------------------------------------

describe('detectBareKafka', () => {
  it('returns false when no pods or statefulsets', () => {
    const store = makeStore();
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(false);
  });

  it('returns true for pod with app=kafka label', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'kafka-0', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
      });
    });
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns true for pod with app.kubernetes.io/name=kafka label', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'kafka-broker-0', 'kafka', {
        metadata: { labels: { 'app.kubernetes.io/name': 'kafka' } },
      });
    });
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns true for pod with app.kubernetes.io/component=kafka label', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'kafka-broker-0', 'kafka', {
        metadata: { labels: { 'app.kubernetes.io/component': 'kafka' } },
      });
    });
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns true for StatefulSet with app=kafka', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'kafka', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
        spec: { replicas: 3 },
      });
    });
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns false for pod with unrelated labels', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'web-pod', 'default', {
        metadata: { labels: { app: 'web' } },
      });
    });
    expect(detectBareKafka(store, TEST_CONTEXT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectZooKeeper
// ---------------------------------------------------------------------------

describe('detectZooKeeper', () => {
  it('returns false when no ZooKeeper pods', () => {
    const store = makeStore();
    expect(detectZooKeeper(store, TEST_CONTEXT)).toBe(false);
  });

  it('returns true for pod with app=zookeeper', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'zk-0', 'kafka', {
        metadata: { labels: { app: 'zookeeper' } },
      });
    });
    expect(detectZooKeeper(store, TEST_CONTEXT)).toBe(true);
  });

  it('returns true for pod with app.kubernetes.io/name=zookeeper', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'zk-0', 'kafka', {
        metadata: { labels: { 'app.kubernetes.io/name': 'zookeeper' } },
      });
    });
    expect(detectZooKeeper(store, TEST_CONTEXT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectKafka
// ---------------------------------------------------------------------------

describe('detectKafka', () => {
  it('returns none when no Kafka present', () => {
    const store = makeStore();
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.deploymentType).toBe('none');
    expect(result.mode).toBe('unknown');
  });

  it('returns strimzi deploymentType when Strimzi CRD present', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'kafkas.kafka.strimzi.io',
        null,
        {
          spec: { group: 'kafka.strimzi.io' },
        },
      );
    });
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.deploymentType).toBe('strimzi');
  });

  it('returns kraft mode when Strimzi present with no ZooKeeper', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'kafkas.kafka.strimzi.io',
        null,
        {
          spec: { group: 'kafka.strimzi.io' },
        },
      );
    });
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.mode).toBe('kraft');
  });

  it('returns zookeeper mode when ZooKeeper pods present', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'kafkas.kafka.strimzi.io',
        null,
        {
          spec: { group: 'kafka.strimzi.io' },
        },
      );
      seedResource(s, ctx, 'Pod', 'zk-0', 'kafka', {
        metadata: { labels: { app: 'zookeeper' } },
      });
    });
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.mode).toBe('zookeeper');
  });

  it('returns bare deploymentType when bare Kafka detected (Strimzi absent)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'kafka-0', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
      });
    });
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.deploymentType).toBe('bare');
  });

  it('Strimzi takes priority over bare detection', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'CustomResourceDefinition',
        'kafkas.kafka.strimzi.io',
        null,
        {
          spec: { group: 'kafka.strimzi.io' },
        },
      );
      // Also has bare pods
      seedResource(s, ctx, 'Pod', 'kafka-0', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
      });
    });
    const result = detectKafka(store, TEST_CONTEXT);
    expect(result.deploymentType).toBe('strimzi');
  });
});

// ---------------------------------------------------------------------------
// getKafkaBrokerCount
// ---------------------------------------------------------------------------

describe('getKafkaBrokerCount', () => {
  it('returns 0 when no Kafka resources', () => {
    const store = makeStore();
    expect(getKafkaBrokerCount(store, TEST_CONTEXT)).toBe(0);
  });

  it('returns StatefulSet replica count for Kafka StatefulSet', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'kafka', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
        spec: { replicas: 3 },
      });
    });
    expect(getKafkaBrokerCount(store, TEST_CONTEXT)).toBe(3);
  });

  it('falls back to pod count when no StatefulSet has replica info', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'kafka-0', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
      });
      seedResource(s, ctx, 'Pod', 'kafka-1', 'kafka', {
        metadata: { labels: { app: 'kafka' } },
      });
    });
    expect(getKafkaBrokerCount(store, TEST_CONTEXT)).toBe(2);
  });
});
