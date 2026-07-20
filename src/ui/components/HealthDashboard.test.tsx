/**
 * Frame tests for HealthDashboard component (Spec 06 §5).
 * Prop-driven; 100% branch coverage.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import React from 'react';
import { HealthDashboard, ruleResultSummary } from './HealthDashboard.js';
import type {
  HealthDashboardProps,
  ClusterSummary,
  MetricsOverviewData,
  KafkaSectionData,
} from './HealthDashboard.js';
import type { EvaluatedRule } from '../../health/types.js';
import { RULE_CATALOG } from '../../health/registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SUMMARY: ClusterSummary = {
  podsRunning: 142,
  warnings: 3,
  errors: 1,
  pending: 2,
  nodesReady: 5,
  nodesTotal: 5,
  nodesUnderPressure: 0,
  namespaceCount: 8,
};

const DEFAULT_METRICS: MetricsOverviewData = {
  prometheusConnected: true,
  cpuSparkline: '▁▂▂▃▄▃▂▁▂▃',
  cpuAvgPct: 23,
  memSparkline: '▄▄▄▄▄▅▄▄▄▄',
  memAvgPct: 61,
};

const NO_KAFKA: KafkaSectionData = {
  detected: false,
  deploymentType: 'none',
  exporterAvailable: false,
  topics: [],
};

const KAFKA_WITH_EXPORTER: KafkaSectionData = {
  detected: true,
  deploymentType: 'strimzi',
  exporterAvailable: true,
  topics: [
    { name: 'orders-topic', maxLag: 0, trend: 'stable' },
    { name: 'analytics-topic', maxLag: 48291, trend: 'climbing' },
  ],
};

const KAFKA_NO_EXPORTER: KafkaSectionData = {
  detected: true,
  deploymentType: 'strimzi',
  exporterAvailable: false,
  topics: [],
};

const KAFKA_BARE_NO_EXPORTER: KafkaSectionData = {
  detected: true,
  deploymentType: 'bare',
  exporterAvailable: false,
  topics: [],
};

function makeErrorRule(): EvaluatedRule {
  const rule = RULE_CATALOG.find((r) => r.id === 'RES-001')!;
  return {
    rule,
    result: {
      status: 'error',
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'api-pod' },
        { kind: 'Pod', namespace: 'default', name: 'web-pod' },
        { kind: 'Pod', namespace: 'default', name: 'worker-pod' },
      ],
    },
  };
}

function makeWarnRule(): EvaluatedRule {
  const rule = RULE_CATALOG.find((r) => r.id === 'REL-001')!;
  return {
    rule,
    result: {
      status: 'warn',
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'api' },
      ],
    },
  };
}

function makeOkRule(): EvaluatedRule {
  const rule = RULE_CATALOG.find((r) => r.id === 'OBS-001')!;
  return {
    rule,
    result: {
      status: 'ok',
      affectedResources: [],
    },
  };
}

function makeSuppressedRule(): EvaluatedRule {
  const rule = RULE_CATALOG.find((r) => r.id === 'SEC-005')!;
  return {
    rule,
    result: {
      status: 'suppressed',
      affectedResources: [],
      detail: 'No secrets operator detected',
    },
  };
}

function noop(): void {
  return;
}

function makeProps(
  overrides: Partial<HealthDashboardProps> = {},
): HealthDashboardProps {
  return {
    clusterName: 'my-cluster',
    summary: DEFAULT_SUMMARY,
    rules: [],
    showPassing: false,
    expandedRuleIds: new Set<string>(),
    showAllRuleIds: new Set<string>(),
    cursor: -1,
    focused: false,
    bestPracticesViewport: 100,
    bestPracticesScroll: 0,
    metrics: DEFAULT_METRICS,
    kafka: NO_KAFKA,
    onNavigateWarnings: noop,
    onNavigateErrors: noop,
    onToggleRule: noop,
    onShowAllOffenders: noop,
    onNavigateOffender: noop,
    onToggleShowPassing: noop,
    onNavigateKafkaTopic: noop,
    ...overrides,
  };
}

function manyOffenders(n: number): EvaluatedRule {
  const rule = RULE_CATALOG.find((r) => r.id === 'RES-001')!;
  return {
    rule,
    result: {
      status: 'error',
      affectedResources: Array.from({ length: n }, (_, i) => ({
        kind: 'Pod',
        namespace: 'default',
        name: `pod-${String(i).padStart(3, '0')}`,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Summary section
// ---------------------------------------------------------------------------

describe('HealthDashboard — summary section', () => {
  it('renders cluster name', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ clusterName: 'prod-cluster' }),
      ),
    );
    expect(lastFrame()).toContain('prod-cluster');
  });

  it('renders pod count', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('142');
  });

  it('renders warning count', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('3');
  });

  it('renders error count', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('1');
  });

  it('renders node readiness', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('5/5');
  });

  it('renders namespace count', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('8');
  });

  it('renders SUMMARY header', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('SUMMARY');
  });

  it('does not show a pressure warning when nodesUnderPressure is 0', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).not.toContain('under pressure');
  });

  it('shows a singular pressure warning for one node under pressure', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          summary: { ...DEFAULT_SUMMARY, nodesUnderPressure: 1 },
        }),
      ),
    );
    expect(lastFrame()).toContain('1 node under pressure');
  });

  it('shows a plural pressure warning for multiple nodes under pressure', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          summary: { ...DEFAULT_SUMMARY, nodesUnderPressure: 2 },
        }),
      ),
    );
    expect(lastFrame()).toContain('2 nodes under pressure');
  });
});

// ---------------------------------------------------------------------------
// Best practices section
// ---------------------------------------------------------------------------

describe('HealthDashboard — best practices section', () => {
  it('shows BEST PRACTICES header', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('BEST PRACTICES');
  });

  it('renders error rule with ERROR label and [show]', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ rules: [makeErrorRule()] }),
      ),
    );
    expect(lastFrame()).toContain('ERROR');
    expect(lastFrame()).toContain('[show]');
  });

  it('renders warn rule with WARN label and [show]', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ rules: [makeWarnRule()] }),
      ),
    );
    expect(lastFrame()).toContain('WARN');
    expect(lastFrame()).toContain('[show]');
  });

  it('shows issue count when there are errors/warnings', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeErrorRule(), makeWarnRule()],
        }),
      ),
    );
    // Should show "2 issues" or similar
    expect(lastFrame()).toContain('issues');
  });

  it('shows [show passing] toggle when OK rules exist and showPassing is false', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeOkRule()],
          showPassing: false,
        }),
      ),
    );
    expect(lastFrame()).toContain('[show passing]');
  });

  it('shows OK rules and [hide passing] when showPassing is true', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeOkRule()],
          showPassing: true,
        }),
      ),
    );
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('[hide passing]');
  });

  it('renders suppressed rule with suppressed marker', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeSuppressedRule()],
        }),
      ),
    );
    expect(lastFrame()).toContain('SUPR');
  });

  it('does not show [show] for OK rules', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeOkRule()],
          showPassing: true,
        }),
      ),
    );
    // OK rules should not have [show] button
    const frame = lastFrame() ?? '';
    // Count [show] occurrences — there shouldn't be any from the OK rule
    expect(frame).not.toContain('[show]\n');
  });
});

// ---------------------------------------------------------------------------
// Rule drill-down (P9R-0017)
// ---------------------------------------------------------------------------

describe('HealthDashboard — rule drill-down', () => {
  it('expands an error rule to its offenders and shows [hide]', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeErrorRule()],
          expandedRuleIds: new Set(['RES-001']),
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[hide]');
    expect(frame).toContain('Pod/default/api-pod');
    expect(frame).toContain('Pod/default/web-pod');
    expect(frame).not.toContain('[show]');
  });

  it('caps offenders at 10 with a "… and N more [all]" fold', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [manyOffenders(47)],
          expandedRuleIds: new Set(['RES-001']),
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('pod-000');
    expect(frame).toContain('pod-009');
    expect(frame).not.toContain('pod-010');
    expect(frame).toContain('… and 37 more');
    expect(frame).toContain('[all]');
  });

  it('shows every offender when the rule is in showAllRuleIds', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [manyOffenders(47)],
          expandedRuleIds: new Set(['RES-001']),
          showAllRuleIds: new Set(['RES-001']),
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('pod-046');
    expect(frame).not.toContain('more');
  });

  it('renders a visible cursor gutter when focused', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeErrorRule()],
          focused: true,
          cursor: 0,
        }),
      ),
    );
    expect(lastFrame()).toContain('›');
  });

  it('uses renderButton for measured affordances when provided', () => {
    const ids: string[] = [];
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeErrorRule()],
          expandedRuleIds: new Set(['RES-001']),
          renderButton: (spec) => {
            ids.push(spec.id);
            return React.createElement(Text, { key: spec.id }, spec.label);
          },
        }),
      ),
    );
    expect(ids).toContain('dashboard.rule.RES-001');
    expect(ids.some((id) => id.startsWith('dashboard.offender.RES-001'))).toBe(
      true,
    );
    expect(lastFrame()).toContain('[hide]');
  });

  it('fires offender and [all] callbacks through the affordances', () => {
    const specs: { id: string; onClick: () => void }[] = [];
    let navigated: string | null = null;
    let showedAll: string | null = null;
    render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [manyOffenders(47)],
          expandedRuleIds: new Set(['RES-001']),
          onNavigateOffender: (offender) => {
            navigated = offender.name;
          },
          onShowAllOffenders: (ruleId) => {
            showedAll = ruleId;
          },
          renderButton: (spec) => {
            specs.push({ id: spec.id, onClick: spec.onClick });
            return React.createElement(Text, { key: spec.id }, spec.label);
          },
        }),
      ),
    );
    const offenderSpec = specs.find((s) =>
      s.id.startsWith('dashboard.offender.RES-001'),
    );
    const moreSpec = specs.find((s) => s.id === 'dashboard.more.RES-001');
    offenderSpec?.onClick();
    moreSpec?.onClick();
    expect(navigated).toBe('pod-000');
    expect(showedAll).toBe('RES-001');
  });

  it('fires the rule toggle callback through its affordance', () => {
    let toggled: string | null = null;
    const specs: { id: string; onClick: () => void }[] = [];
    render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeErrorRule()],
          onToggleRule: (ruleId) => {
            toggled = ruleId;
          },
          renderButton: (spec) => {
            specs.push({ id: spec.id, onClick: spec.onClick });
            return React.createElement(Text, { key: spec.id }, spec.label);
          },
        }),
      ),
    );
    specs.find((s) => s.id === 'dashboard.rule.RES-001')?.onClick();
    expect(toggled).toBe('RES-001');
  });

  it('windows offenders and shows scroll hints', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [manyOffenders(47)],
          expandedRuleIds: new Set(['RES-001']),
          showAllRuleIds: new Set(['RES-001']),
          bestPracticesViewport: 5,
          bestPracticesScroll: 3,
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('more above');
    expect(frame).toContain('more below');
  });

  it('renders the passing rules dimmed list when expanded', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          rules: [makeOkRule()],
          showPassing: true,
        }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✓');
    expect(frame).toContain('[hide passing]');
  });
});

// ---------------------------------------------------------------------------
// Metrics overview section
// ---------------------------------------------------------------------------

describe('HealthDashboard — metrics overview section', () => {
  it('renders METRICS OVERVIEW when metrics provided', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('METRICS OVERVIEW');
  });

  it('renders sparkline for CPU', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('▁▂▂▃▄▃▂▁▂▃');
  });

  it('renders CPU percentage', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('23%');
  });

  it('renders memory sparkline', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).toContain('▄▄▄▄▄▅▄▄▄▄');
  });

  it('does not render metrics section when metrics is null', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps({ metrics: null })),
    );
    expect(lastFrame()).not.toContain('METRICS OVERVIEW');
  });

  it('shows disconnected state when Prometheus not connected', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          metrics: { ...DEFAULT_METRICS, prometheusConnected: false },
        }),
      ),
    );
    expect(lastFrame()).toContain('disconnected');
  });
});

// ---------------------------------------------------------------------------
// Kafka section
// ---------------------------------------------------------------------------

describe('HealthDashboard — Kafka section', () => {
  it('does not render Kafka section when not detected', () => {
    const { lastFrame } = render(
      React.createElement(HealthDashboard, makeProps()),
    );
    expect(lastFrame()).not.toContain('KAFKA');
  });

  it('renders KAFKA header when Kafka detected', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ kafka: KAFKA_WITH_EXPORTER }),
      ),
    );
    expect(lastFrame()).toContain('KAFKA');
  });

  it('renders topic with climbing lag indicator', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ kafka: KAFKA_WITH_EXPORTER }),
      ),
    );
    expect(lastFrame()).toContain('analytics-topic');
    expect(lastFrame()).toContain('↑');
  });

  it('renders healthy topic indicator', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ kafka: KAFKA_WITH_EXPORTER }),
      ),
    );
    expect(lastFrame()).toContain('orders-topic');
    expect(lastFrame()).toContain('healthy');
  });

  it('renders Strimzi empty state when no exporter', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ kafka: KAFKA_NO_EXPORTER }),
      ),
    );
    expect(lastFrame()).toContain('KAFKA');
    expect(lastFrame()).toContain('Kafka Exporter');
    expect(lastFrame()).toContain('kafkaExporter');
  });

  it('renders bare Kafka empty state when no exporter', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({ kafka: KAFKA_BARE_NO_EXPORTER }),
      ),
    );
    expect(lastFrame()).toContain('KAFKA');
    expect(lastFrame()).toContain('kafka-exporter');
  });

  it('renders no topics message when topics is empty but exporter available', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          kafka: { ...KAFKA_WITH_EXPORTER, topics: [] },
        }),
      ),
    );
    expect(lastFrame()).toContain('No topics');
  });

  it('formats large lag values with k suffix', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          kafka: {
            ...KAFKA_WITH_EXPORTER,
            topics: [{ name: 'big-topic', maxLag: 48291, trend: 'climbing' }],
          },
        }),
      ),
    );
    // 48291 should be formatted as 48k
    expect(lastFrame()).toContain('48k');
  });

  it('formats million-scale lag with M suffix', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          kafka: {
            ...KAFKA_WITH_EXPORTER,
            topics: [
              { name: 'huge-topic', maxLag: 2_000_000, trend: 'stable' },
            ],
          },
        }),
      ),
    );
    expect(lastFrame()).toContain('2M');
  });

  it('formats small lag value (< 1000) as plain number', () => {
    const { lastFrame } = render(
      React.createElement(
        HealthDashboard,
        makeProps({
          kafka: {
            ...KAFKA_WITH_EXPORTER,
            topics: [{ name: 'small-topic', maxLag: 42, trend: 'dropping' }],
          },
        }),
      ),
    );
    expect(lastFrame()).toContain('42');
  });
});

// ---------------------------------------------------------------------------
// ruleResultSummary helper
// ---------------------------------------------------------------------------

describe('ruleResultSummary', () => {
  it('returns status:count format', () => {
    expect(
      ruleResultSummary({
        status: 'error',
        affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'api' }],
      }),
    ).toBe('error:1');
  });

  it('returns ok:0 for passing rule', () => {
    expect(ruleResultSummary({ status: 'ok', affectedResources: [] })).toBe(
      'ok:0',
    );
  });
});
