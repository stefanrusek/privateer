/**
 * Regression coverage for P9R-0017's mouse offender-click path (Overview
 * dashboard). Root-cause investigation for the live-verified gap ("clicking
 * an offender line with the mouse does nothing, no scrolling involved")
 * found no defect in the measured-widget registration / pure dispatch
 * pipeline: every realistic re-render shape — a fresh mount right after
 * `[show]` is clicked, a sibling row shifting an offender's absolute index,
 * and a React key being reused across two *different* item types at the same
 * `key={absoluteIndex}` slot — remeasures and dispatches correctly, because
 * `Button`'s registration effect is keyed on `id` (unique per rule/offender)
 * as well as the scroll-derived `remeasureKey`.
 *
 * These tests pin that behavior down as permanent regression coverage (there
 * was previously no test exercising the real `<Button>` + dispatch pipeline
 * against `HealthDashboard` at all). If the live gap persists, the defect is
 * outside what's covered here — most likely a real-terminal/Ink-runtime
 * timing detail `ink-testing-library` cannot reproduce — and needs a live
 * tmux capture to pin down further (see ticket notes).
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useState } from 'react';
import {
  HealthDashboard,
  type ClusterSummary,
  type KafkaSectionData,
} from '../../ui/components/HealthDashboard.js';
import { MeasuredRegistryProvider, Button } from './measured-widgets.js';
import type { Entry } from '../../input/dispatch.js';
import { pressTarget } from '../../input/dispatch.js';
import type { EvaluatedRule } from '../../health/types.js';
import { RULE_CATALOG } from '../../health/registry.js';

const SUMMARY: ClusterSummary = {
  podsRunning: 1,
  warnings: 0,
  errors: 1,
  pending: 0,
  nodesReady: 1,
  nodesTotal: 1,
  nodesUnderPressure: 0,
  namespaceCount: 1,
};

const NO_KAFKA: KafkaSectionData = {
  detected: false,
  deploymentType: 'none',
  exporterAvailable: false,
  topics: [],
};

function errorRule(id: string, offenderName: string): EvaluatedRule {
  return {
    rule: { ...RULE_CATALOG.find((r) => r.id === 'RES-001')!, id },
    result: {
      status: 'error',
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: offenderName },
      ],
    },
  } as unknown as EvaluatedRule;
}

function okRule(id: string): EvaluatedRule {
  return {
    rule: { ...RULE_CATALOG.find((r) => r.id === 'RES-001')!, id },
    result: { status: 'ok', affectedResources: [] },
  } as unknown as EvaluatedRule;
}

/** A minimal in-memory `MeasuredRegistry` that records rects and handlers. */
function fakeRegistry(): {
  entries: Map<string, Entry>;
  clicks: Map<string, () => void>;
  registry: {
    registerMeasured: (e: Entry, onClick?: () => void) => void;
    unregisterMeasured: (id: string) => void;
  };
} {
  const entries = new Map<string, Entry>();
  const clicks = new Map<string, () => void>();
  return {
    entries,
    clicks,
    registry: {
      registerMeasured: (e, onClick) => {
        entries.set(e.id ?? '', e);
        if (onClick !== undefined) {
          clicks.set(e.id ?? '', onClick);
        }
      },
      unregisterMeasured: (id) => {
        entries.delete(id);
        clicks.delete(id);
      },
    },
  };
}

/** A stateful harness driving `expandedRuleIds` the way the controller does. */
function Harness({
  rules,
  registry,
}: {
  rules: EvaluatedRule[];
  registry: ReturnType<typeof fakeRegistry>['registry'];
}): React.ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <MeasuredRegistryProvider registry={registry}>
      <HealthDashboard
        clusterName="test"
        summary={SUMMARY}
        rules={rules}
        showPassing={false}
        expandedRuleIds={expanded}
        showAllRuleIds={new Set()}
        cursor={-1}
        focused={false}
        bestPracticesViewport={20}
        bestPracticesScroll={0}
        metrics={null}
        kafka={NO_KAFKA}
        onNavigateWarnings={() => undefined}
        onNavigateErrors={() => undefined}
        onToggleRule={(id) => {
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
        }}
        onShowAllOffenders={() => undefined}
        onNavigateOffender={() => undefined}
        onToggleShowPassing={() => undefined}
        onNavigateKafkaTopic={() => undefined}
        renderButton={({ id, label, onClick, active, remeasureKey }) => (
          <Button
            id={id}
            label={label}
            active={active}
            onClick={onClick}
            remeasureKey={remeasureKey}
          />
        )}
      />
    </MeasuredRegistryProvider>
  );
}

/** Flush the effect queue (registration runs in a passive `useEffect`). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('Overview dashboard mouse offender-click (P9R-0017)', () => {
  it('registers a clickable button over the offender row after [show]', async () => {
    const { entries, clicks, registry } = fakeRegistry();
    render(
      <Harness rules={[errorRule('RES-001', 'api-pod')]} registry={registry} />,
    );
    await flush();

    clicks.get('dashboard.rule.RES-001')?.();
    await flush();

    const offenderId = 'dashboard.offender.RES-001.Pod.default.api-pod';
    const offenderEntry = entries.get(offenderId);
    expect(offenderEntry).toBeDefined();

    // The pure dispatcher must resolve a click on the offender's own rect to
    // its button — not to the resource-list region behind it — exactly like
    // the working `[show]`/`[hide]` affordance.
    const hit = pressTarget(
      [...entries.values()],
      offenderEntry!.rect.x,
      offenderEntry!.rect.y,
    );
    expect(hit?.kind).toBe('button');
    expect(hit?.id).toBe(offenderId);
    expect(clicks.get(offenderId)).toBeDefined();
  });

  it('remeasures correctly when a sibling row insertion shifts the offender down', async () => {
    // Two rules: expanding the first inserts an offender row between it and
    // the second rule, shifting the second rule's absolute index/key by one —
    // exercising the "React reuses a mid-list key for different content"
    // path, not just a trailing append.
    const { entries, clicks, registry } = fakeRegistry();
    render(
      <Harness
        rules={[errorRule('RES-001', 'pod-a'), errorRule('RES-002', 'pod-b')]}
        registry={registry}
      />,
    );
    await flush();

    clicks.get('dashboard.rule.RES-001')?.();
    await flush();

    const offenderId = 'dashboard.offender.RES-001.Pod.default.pod-a';
    const offenderEntry = entries.get(offenderId);
    const rule2Entry = entries.get('dashboard.rule.RES-002');
    expect(offenderEntry).toBeDefined();
    expect(rule2Entry).toBeDefined();
    // The two rows must not have collapsed onto the same rect (the class of
    // bug a stale hit-rect would produce).
    expect(offenderEntry!.rect.y).not.toBe(rule2Entry!.rect.y);

    const snap = [...entries.values()];
    expect(
      pressTarget(snap, offenderEntry!.rect.x, offenderEntry!.rect.y)?.id,
    ).toBe(offenderId);
    expect(pressTarget(snap, rule2Entry!.rect.x, rule2Entry!.rect.y)?.id).toBe(
      'dashboard.rule.RES-002',
    );
  });

  it('remeasures correctly when the offender reuses a key vacated by an unrelated row type', async () => {
    // One error rule + one passing rule: before expansion, key=1 renders the
    // `[show passing]` toggle; after expansion, key=1 renders the offender —
    // a different item *type* reusing the same React key/slot.
    const { entries, clicks, registry } = fakeRegistry();
    render(
      <Harness
        rules={[errorRule('RES-001', 'pod-a'), okRule('OK-001')]}
        registry={registry}
      />,
    );
    await flush();

    clicks.get('dashboard.rule.RES-001')?.();
    await flush();

    const offenderId = 'dashboard.offender.RES-001.Pod.default.pod-a';
    const offenderEntry = entries.get(offenderId);
    const passingEntry = entries.get('dashboard.passing');
    expect(offenderEntry).toBeDefined();
    expect(passingEntry).toBeDefined();

    const snap = [...entries.values()];
    expect(
      pressTarget(snap, offenderEntry!.rect.x, offenderEntry!.rect.y)?.id,
    ).toBe(offenderId);
    expect(
      pressTarget(snap, passingEntry!.rect.x, passingEntry!.rect.y)?.id,
    ).toBe('dashboard.passing');
  });
});
