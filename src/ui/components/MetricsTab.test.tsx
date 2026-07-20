/**
 * MetricsTab unit tests (Spec 06 §4).
 * Frame-tested to 100%.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { MetricsTab, MAX_CHART_WIDTH } from './MetricsTab.js';
import type { MetricsTabProps } from './MetricsTab.js';
import { createRangeSelector, selectRange } from './MetricsTab.js';
import type { ExporterCapabilities } from '../../metrics/exporters.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_CAPS: ExporterCapabilities = {
  cadvisor: true,
  kubeStateMetrics: true,
  kafkaExporter: true,
  strimziJmx: true,
};

const NO_CAPS: ExporterCapabilities = {
  cadvisor: false,
  kubeStateMetrics: false,
  kafkaExporter: false,
  strimziJmx: false,
};

function noop(): void {
  return;
}

function baseProps(overrides: Partial<MetricsTabProps> = {}): MetricsTabProps {
  return {
    resourceKind: 'Pod',
    resourceName: 'order-api',
    tier: 'prometheus',
    capabilities: ALL_CAPS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §4.5 No-metrics state
// ---------------------------------------------------------------------------

describe('MetricsTab — no metrics state', () => {
  it('shows no metrics message for tier none', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ tier: 'none' })),
    );
    expect(lastFrame()).toContain('No metrics available');
  });

  it('no metrics state mentions Prometheus', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ tier: 'none' })),
    );
    expect(lastFrame()).toContain('Prometheus');
  });

  it('no metrics state mentions metrics-server', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ tier: 'none' })),
    );
    expect(lastFrame()).toContain('metrics-server');
  });
});

// ---------------------------------------------------------------------------
// §2.3 Session data banner
// ---------------------------------------------------------------------------

describe('MetricsTab — metrics-server tier', () => {
  it('shows Prometheus not found banner', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ tier: 'metrics-server' })),
    );
    expect(lastFrame()).toContain('Prometheus not found');
  });
});

// ---------------------------------------------------------------------------
// Range selector
// ---------------------------------------------------------------------------

describe('MetricsTab — range selector', () => {
  it('shows default range selector with 20m option', () => {
    const { lastFrame } = render(React.createElement(MetricsTab, baseProps()));
    expect(lastFrame()).toContain('20m');
  });

  it('shows default range selector with 1h option', () => {
    const { lastFrame } = render(React.createElement(MetricsTab, baseProps()));
    expect(lastFrame()).toContain('1h');
  });

  it('shows all range options', () => {
    const { lastFrame } = render(React.createElement(MetricsTab, baseProps()));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('4h');
    expect(frame).toContain('1d');
    expect(frame).toContain('2d');
  });

  it('shows custom range model when provided', () => {
    const rangeModel = selectRange(createRangeSelector(), '4h');
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ rangeModel })),
    );
    expect(lastFrame()).toContain('4h');
  });

  it('accepts onRangeChange callback prop', () => {
    // Just confirm it renders without error when callback is provided
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ onRangeChange: noop })),
    );
    expect(lastFrame()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Pod charts
// ---------------------------------------------------------------------------

describe('MetricsTab — Pod charts', () => {
  it('shows CPU chart when cadvisor enabled', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Pod' })),
    );
    expect(lastFrame()).toContain('CPU');
  });

  it('shows Memory chart when cadvisor enabled', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Pod' })),
    );
    expect(lastFrame()).toContain('Memory');
  });

  it('shows missing cAdvisor note when cadvisor disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          capabilities: { ...ALL_CAPS, cadvisor: false },
        }),
      ),
    );
    expect(lastFrame()).toContain('cAdvisor');
  });

  it('shows missing kube-state-metrics note when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          capabilities: { ...ALL_CAPS, kubeStateMetrics: false },
        }),
      ),
    );
    expect(lastFrame()).toContain('kube-state-metrics');
  });

  it('shows Restart count chart when kube-state-metrics enabled', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Pod' })),
    );
    expect(lastFrame()).toContain('Restart');
  });
});

// ---------------------------------------------------------------------------
// Node charts
// ---------------------------------------------------------------------------

describe('MetricsTab — Node charts', () => {
  it('shows CPU chart for Node', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Node' })),
    );
    expect(lastFrame()).toContain('CPU');
  });

  it('shows missing cAdvisor note for Node when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Node',
          capabilities: NO_CAPS,
        }),
      ),
    );
    expect(lastFrame()).toContain('cAdvisor');
  });
});

// ---------------------------------------------------------------------------
// Deployment / StatefulSet charts
// ---------------------------------------------------------------------------

describe('MetricsTab — Deployment charts', () => {
  it('shows Aggregate CPU for Deployment', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'Deployment' }),
      ),
    );
    expect(lastFrame()).toContain('CPU');
  });

  it('shows Replica Count for Deployment when ksm enabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'Deployment' }),
      ),
    );
    expect(lastFrame()).toContain('Replica');
  });

  it('shows Aggregate CPU for StatefulSet', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'StatefulSet' }),
      ),
    );
    expect(lastFrame()).toContain('CPU');
  });

  it('shows missing cAdvisor note for Deployment when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Deployment',
          capabilities: NO_CAPS,
        }),
      ),
    );
    expect(lastFrame()).toContain('cAdvisor');
  });

  it('shows missing kube-state-metrics note for StatefulSet when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'StatefulSet',
          capabilities: { ...ALL_CAPS, kubeStateMetrics: false },
        }),
      ),
    );
    expect(lastFrame()).toContain('kube-state-metrics');
  });
});

// ---------------------------------------------------------------------------
// Kafka cluster charts
// ---------------------------------------------------------------------------

describe('MetricsTab — Kafka cluster charts', () => {
  it('shows Under-replicated Partitions when strimziJmx enabled', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Kafka' })),
    );
    expect(lastFrame()).toContain('Under-replicated');
  });

  it('shows missing Strimzi JMX note when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Kafka',
          capabilities: NO_CAPS,
        }),
      ),
    );
    expect(lastFrame()).toContain('Strimzi JMX');
  });
});

// ---------------------------------------------------------------------------
// KafkaTopic charts (§4.4)
// ---------------------------------------------------------------------------

describe('MetricsTab — KafkaTopic charts', () => {
  it('shows Consumer Lag chart when kafkaExporter enabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'KafkaTopic' }),
      ),
    );
    expect(lastFrame()).toContain('Consumer Lag');
  });

  it('shows missing kafka-exporter note when disabled', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          capabilities: NO_CAPS,
        }),
      ),
    );
    expect(lastFrame()).toContain('kafka-exporter');
  });

  it('shows trend indicator for lag series', () => {
    const lagSeries = [
      {
        labels: { consumer_group: 'order-service' },
        points: [
          { timestampMs: 0, value: 100 },
          { timestampMs: 1000, value: 200 },
          { timestampMs: 2000, value: 300 },
          { timestampMs: 3000, value: 400 },
          { timestampMs: 4000, value: 500 },
        ],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
        }),
      ),
    );
    expect(lastFrame()).toContain('↑');
  });

  it('shows group name from consumer_group label', () => {
    const lagSeries = [
      {
        labels: { consumer_group: 'order-service' },
        points: [{ timestampMs: 0, value: 100 }],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
        }),
      ),
    );
    expect(lastFrame()).toContain('order-service');
  });

  it('uses group label as fallback when no consumer_group label', () => {
    const lagSeries = [
      {
        labels: { group: 'payment-service' },
        points: [{ timestampMs: 0, value: 100 }],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
        }),
      ),
    );
    expect(lastFrame()).toContain('payment-service');
  });

  it('uses index as group name when no group label available', () => {
    const lagSeries = [
      {
        labels: {},
        points: [{ timestampMs: 0, value: 100 }],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
        }),
      ),
    );
    expect(lastFrame()).toContain('group-0');
  });

  it('shows threshold values', () => {
    const lagSeries = [
      {
        labels: {},
        points: [{ timestampMs: 0, value: 100 }],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
          lagWarningThreshold: 5000,
          lagCriticalThreshold: 10000,
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('5000');
    expect(frame).toContain('10000');
  });

  it('shows No data when lagSeries is empty', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries: [],
        }),
      ),
    );
    expect(lastFrame()).toContain('No data');
  });

  it('handles lag series with empty points (shows 0 lag)', () => {
    const lagSeries = [
      { labels: { consumer_group: 'empty-group' }, points: [] },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'KafkaTopic',
          lagSeries,
        }),
      ),
    );
    expect(lastFrame()).toContain('empty-group');
    // currentLag should default to 0 when points are empty
    expect(lastFrame()).toContain('(0)');
  });
});

// ---------------------------------------------------------------------------
// KafkaConnect charts
// ---------------------------------------------------------------------------

describe('MetricsTab — KafkaConnect charts', () => {
  it('shows Task Status chart for KafkaConnect', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'KafkaConnect' }),
      ),
    );
    expect(lastFrame()).toContain('Task Status');
  });

  it('shows Records In/Out chart for KafkaConnect', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ resourceKind: 'KafkaConnect' }),
      ),
    );
    expect(lastFrame()).toContain('Records In/Out');
  });
});

// ---------------------------------------------------------------------------
// Chart with actual series data
// ---------------------------------------------------------------------------

describe('MetricsTab — ChartPlaceholder with data', () => {
  it('renders an ASCII chart when data is provided', () => {
    const cpuSeries = [
      {
        labels: {},
        points: [
          { timestampMs: 0, value: 50 },
          { timestampMs: 1000, value: 60 },
        ],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          cpuSeries,
        }),
      ),
    );
    // Should render the ASCII chart plot when data is present
    expect(lastFrame()).toContain('█');
  });

  it('clamps chart lines to a narrow paneWidth (no wrap)', () => {
    const cpuSeries = [
      {
        labels: {},
        points: Array.from({ length: 80 }, (_, i) => ({
          timestampMs: i * 1000,
          value: 50 + i,
        })),
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          cpuSeries,
          paneWidth: 24,
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    // Every rendered chart line (the ones carrying plot glyphs) stays within
    // the 24-col pane.
    const chartLines = frame.split('\n').filter((l) => /[█▁▂▃▄▅▆▇]/.test(l));
    expect(chartLines.length).toBeGreaterThan(0);
    for (const line of chartLines) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });

  it('fills a very wide pane instead of capping at MAX_CHART_WIDTH (P9R-0006)', () => {
    const cpuSeries = [
      {
        labels: {},
        points: Array.from({ length: 200 }, (_, i) => ({
          timestampMs: i * 1000,
          value: 50 + i,
        })),
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          cpuSeries,
          paneWidth: 500,
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    // Spans the full 500-col pane — no artificial cap at MAX_CHART_WIDTH.
    const chartLines = frame.split('\n').filter((l) => /[█▁▂▃▄▅▆▇]/.test(l));
    expect(chartLines.length).toBeGreaterThan(0);
    for (const line of chartLines) {
      expect(line.length).toBeLessThanOrEqual(500);
    }
    expect(chartLines.some((l) => l.trimEnd().length > MAX_CHART_WIDTH)).toBe(
      true,
    );
  });

  it('ignores a non-positive paneWidth and falls back to the max width', () => {
    const cpuSeries = [
      {
        labels: {},
        points: [
          { timestampMs: 0, value: 50 },
          { timestampMs: 1000, value: 60 },
        ],
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          cpuSeries,
          paneWidth: 0,
        }),
      ),
    );
    expect(lastFrame()).toContain('█');
  });
});

// ---------------------------------------------------------------------------
// Unknown resource type
// ---------------------------------------------------------------------------

describe('MetricsTab — unknown resource type', () => {
  it('shows no charts message for unknown kind', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceKind: 'Unknown' })),
    );
    expect(lastFrame()).toContain('No charts defined');
  });
});

// ---------------------------------------------------------------------------
// Resource name in title
// ---------------------------------------------------------------------------

describe('MetricsTab — resource name', () => {
  it('shows resource name in title', () => {
    const { lastFrame } = render(
      React.createElement(MetricsTab, baseProps({ resourceName: 'my-pod' })),
    );
    expect(lastFrame()).toContain('my-pod');
  });
});

describe('MetricsTab scroll viewport (chunk 03)', () => {
  it('windows projected chart lines when a viewportHeight is given', () => {
    const series = [
      {
        labels: { metric: 'cpu' },
        points: Array.from({ length: 8 }, (_, i) => ({
          timestampMs: i * 1000,
          value: i,
        })),
      },
    ];
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({
          resourceKind: 'Pod',
          paneWidth: 60,
          cpuSeries: series,
          memorySeries: series,
          offset: 0,
          viewportHeight: 4,
        }),
      ),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Metrics');
    // a scrollbar gutter appears because the projected content overflows
    expect(out).toContain('█');
  });

  it('no-metrics state still scrolls via the viewport', () => {
    const { lastFrame } = render(
      React.createElement(
        MetricsTab,
        baseProps({ tier: 'none', offset: 0, viewportHeight: 2 }),
      ),
    );
    expect(lastFrame()).toContain('No metrics available');
  });
});
