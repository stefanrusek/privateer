/**
 * Tests for the deterministic fast-path intent parser.
 *
 * Spec 07 §8 — table-driven + property tests.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseFastPath } from './fast-path.js';
import { KIND_ALIASES } from './aliases.js';

// ---------------------------------------------------------------------------
// Navigate patterns — "(show|go to|open) <alias>"
// ---------------------------------------------------------------------------

describe('parseFastPath — navigate verb patterns', () => {
  it('"show pods" → navigate Pod', () => {
    expect(parseFastPath('show pods')).toEqual({
      action: 'navigate',
      resource: 'Pod',
    });
  });

  it('"show pod" (singular) → navigate Pod', () => {
    expect(parseFastPath('show pod')).toEqual({
      action: 'navigate',
      resource: 'Pod',
    });
  });

  it('"go to deployments" → navigate Deployment', () => {
    expect(parseFastPath('go to deployments')).toEqual({
      action: 'navigate',
      resource: 'Deployment',
    });
  });

  it('"go to deploy" (alias) → navigate Deployment', () => {
    expect(parseFastPath('go to deploy')).toEqual({
      action: 'navigate',
      resource: 'Deployment',
    });
  });

  it('"open services" → navigate Service', () => {
    expect(parseFastPath('open services')).toEqual({
      action: 'navigate',
      resource: 'Service',
    });
  });

  it('"open svc" (alias) → navigate Service', () => {
    expect(parseFastPath('open svc')).toEqual({
      action: 'navigate',
      resource: 'Service',
    });
  });

  it('"SHOW PODS" (uppercase) → navigate Pod', () => {
    expect(parseFastPath('SHOW PODS')).toEqual({
      action: 'navigate',
      resource: 'Pod',
    });
  });

  it('"Go To Deploy" (mixed case) → navigate Deployment', () => {
    expect(parseFastPath('Go To Deploy')).toEqual({
      action: 'navigate',
      resource: 'Deployment',
    });
  });

  // Table-driven: every alias works with "show"
  it.each([...KIND_ALIASES.entries()])(
    '"show %s" → navigate %s',
    (alias, kind) => {
      const result = parseFastPath(`show ${alias}`);
      expect(result).toEqual({ action: 'navigate', resource: kind });
    },
  );

  // Table-driven: every alias works with "open"
  it.each([...KIND_ALIASES.entries()])(
    '"open %s" → navigate %s',
    (alias, kind) => {
      const result = parseFastPath(`open ${alias}`);
      expect(result).toEqual({ action: 'navigate', resource: kind });
    },
  );

  // Table-driven: every alias works with "go to"
  it.each([...KIND_ALIASES.entries()])(
    '"go to %s" → navigate %s',
    (alias, kind) => {
      const result = parseFastPath(`go to ${alias}`);
      expect(result).toEqual({ action: 'navigate', resource: kind });
    },
  );
});

// ---------------------------------------------------------------------------
// Bare alias navigation
// ---------------------------------------------------------------------------

describe('parseFastPath — bare alias', () => {
  it('"pods" → navigate Pod', () => {
    expect(parseFastPath('pods')).toEqual({
      action: 'navigate',
      resource: 'Pod',
    });
  });

  it('"deploy" (alias) → navigate Deployment', () => {
    expect(parseFastPath('deploy')).toEqual({
      action: 'navigate',
      resource: 'Deployment',
    });
  });

  it('"svc" (alias) → navigate Service', () => {
    expect(parseFastPath('svc')).toEqual({
      action: 'navigate',
      resource: 'Service',
    });
  });

  // Table-driven: every alias alone resolves
  it.each([...KIND_ALIASES.entries()])(
    'bare "%s" → navigate %s',
    (alias, kind) => {
      const result = parseFastPath(alias);
      expect(result).toEqual({ action: 'navigate', resource: kind });
    },
  );

  it('bare uppercase alias resolves', () => {
    expect(parseFastPath('PODS')).toEqual({
      action: 'navigate',
      resource: 'Pod',
    });
  });
});

// ---------------------------------------------------------------------------
// "<alias> in <namespace>" pattern
// ---------------------------------------------------------------------------

describe('parseFastPath — alias in namespace', () => {
  it('"pods in default" → multi [navigate Pod, filter namespace=default]', () => {
    expect(parseFastPath('pods in default')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', namespace: 'default' },
      ],
    });
  });

  it('"deploy in staging" → multi [navigate Deployment, filter namespace=staging]', () => {
    expect(parseFastPath('deploy in staging')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Deployment' },
        { action: 'filter', namespace: 'staging' },
      ],
    });
  });

  it('"svc in production" → multi navigate Service + filter namespace', () => {
    expect(parseFastPath('svc in production')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Service' },
        { action: 'filter', namespace: 'production' },
      ],
    });
  });

  it('"deployments in kube-system" → multi navigate Deployment + filter namespace', () => {
    expect(parseFastPath('deployments in kube-system')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Deployment' },
        { action: 'filter', namespace: 'kube-system' },
      ],
    });
  });

  it('"unknown-kind in ns" → null (kind not recognized)', () => {
    expect(parseFastPath('unknown-kind in ns')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error-state patterns
// ---------------------------------------------------------------------------

describe('parseFastPath — error modifier patterns', () => {
  it('"erroring pods" → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('erroring pods')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"crashing pods" → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('crashing pods')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"failing pods" → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('failing pods')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"broken pods" → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('broken pods')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"erroring" alone → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('erroring')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"crashing" alone → multi [navigate Pod, filter search=error]', () => {
    expect(parseFastPath('crashing')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"ERRORING PODS" (uppercase) → multi navigate Pod + filter error', () => {
    expect(parseFastPath('ERRORING PODS')).toEqual({
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    });
  });

  it('"erroring xyz" (unknown alias) → null', () => {
    expect(parseFastPath('erroring xyz')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Known-namespace bare names
// ---------------------------------------------------------------------------

describe('parseFastPath — known namespace bare names', () => {
  const ns = new Set(['default', 'kube-system', 'staging']);

  it('"default" → filter namespace=default', () => {
    expect(parseFastPath('default', ns)).toEqual({
      action: 'filter',
      namespace: 'default',
    });
  });

  it('"kube-system" → filter namespace=kube-system', () => {
    expect(parseFastPath('kube-system', ns)).toEqual({
      action: 'filter',
      namespace: 'kube-system',
    });
  });

  it('"staging" → filter namespace=staging', () => {
    expect(parseFastPath('staging', ns)).toEqual({
      action: 'filter',
      namespace: 'staging',
    });
  });

  it('alias takes priority over namespace when both match', () => {
    // 'ns' is both an alias for Namespace kind AND a potential ns name
    const withNs = new Set(['ns', 'default']);
    const result = parseFastPath('ns', withNs);
    // alias wins
    expect(result).toEqual({ action: 'navigate', resource: 'Namespace' });
  });

  it('unknown bare token → null', () => {
    expect(parseFastPath('production', ns)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fall-through cases
// ---------------------------------------------------------------------------

describe('parseFastPath — fall-through (no match)', () => {
  it('empty string → null', () => {
    expect(parseFastPath('')).toBeNull();
  });

  it('whitespace only → null', () => {
    expect(parseFastPath('   ')).toBeNull();
  });

  it('"what pods are crashing" → null (question word)', () => {
    expect(parseFastPath('what pods are crashing')).toBeNull();
  });

  it('"why is the pod failing" → null (question word)', () => {
    expect(parseFastPath('why is the pod failing')).toBeNull();
  });

  it('"how many deployments" → null (question word)', () => {
    expect(parseFastPath('how many deployments')).toBeNull();
  });

  it('"which namespace" → null (question word)', () => {
    expect(parseFastPath('which namespace')).toBeNull();
  });

  it('"find the order-api pod" → null (unmatched tokens)', () => {
    expect(parseFastPath('find the order-api pod')).toBeNull();
  });

  it('"show me the erroring pods" → null (unmatched "me the")', () => {
    expect(parseFastPath('show me the erroring pods')).toBeNull();
  });

  it('"list all pods" → null (unmatched "list" / "all")', () => {
    expect(parseFastPath('list all pods')).toBeNull();
  });

  it('"more pods than before" → null (comparative)', () => {
    expect(parseFastPath('more pods than before')).toBeNull();
  });

  it('"fewer deployments" → null (comparative)', () => {
    expect(parseFastPath('fewer deployments')).toBeNull();
  });

  it('"hello world" → null (random text)', () => {
    expect(parseFastPath('hello world')).toBeNull();
  });

  it('"what is a pod" → null (question word)', () => {
    expect(parseFastPath('what is a pod')).toBeNull();
  });

  it('"show unknown-alias" → null (unknown alias)', () => {
    expect(parseFastPath('show unknown-alias')).toBeNull();
  });

  it('"go to unknown-alias" → null (unknown alias)', () => {
    expect(parseFastPath('go to unknown-alias')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fast path never produces answer action
// ---------------------------------------------------------------------------

describe('parseFastPath — never produces answer action', () => {
  it('result is never an answer action for any input', () => {
    const samples = [
      'what is a pod',
      'why is it failing',
      'how many pods',
      'which namespace has most deployments',
      'explain kubernetes',
      'tell me about deployments',
      'show pods',
      'deploy',
      'erroring pods',
      '',
    ];
    for (const input of samples) {
      const result = parseFastPath(input);
      if (result !== null) {
        expect(result.action).not.toBe('answer');
      }
    }
  });

  // Property test: question-word inputs never match
  it('property: any input containing a question word returns null', () => {
    const questionWords = [
      'what',
      'why',
      'how',
      'which',
      'where',
      'when',
      'who',
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...questionWords),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
          minLength: 0,
          maxLength: 5,
        }),
        (qw, extraTokens) => {
          const query = [qw, ...extraTokens].join(' ');
          expect(parseFastPath(query)).toBeNull();
        },
      ),
    );
  });

  // Property test: no result is ever an answer action
  it('property: parseFastPath never returns an answer action', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), (input) => {
        const result = parseFastPath(input);
        if (result !== null) {
          expect(result.action).not.toBe('answer');
        }
      }),
    );
  });
});
