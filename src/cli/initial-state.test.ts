import { describe, it, expect } from 'vitest';
import { initialAppState } from './initial-state.js';
import { SIDEBAR_CATEGORIES } from '../ui/sidebar-data.js';

describe('initialAppState', () => {
  it('lands on Overview with the sidebar focused', () => {
    const s = initialAppState({
      context: 'prod',
      namespace: '',
      contexts: ['prod', 'dev'],
      namespaces: ['default'],
    });
    expect(s.activeKind).toBe('Overview');
    expect(s.focus).toBe('sidebar');
    expect(s.context).toBe('prod');
    expect(s.showDetail).toBe(false);
    expect(s.sidebarRatio).toBeCloseTo(0.2);
    expect(s.allContexts).toEqual(['prod', 'dev']);
  });

  it('starts every category collapsed except Workloads', () => {
    const s = initialAppState({
      context: 'c',
      namespace: '',
      contexts: [],
      namespaces: [],
    });
    expect(s.collapsedCategories.has('workloads')).toBe(false);
    for (const cat of SIDEBAR_CATEGORIES) {
      if (cat.id !== 'workloads') {
        expect(s.collapsedCategories.has(cat.id)).toBe(true);
      }
    }
    expect(s.collapsedCategories.size).toBe(SIDEBAR_CATEGORIES.length - 1);
  });

  it('carries the namespace filter through', () => {
    const s = initialAppState({
      context: 'c',
      namespace: 'app',
      contexts: [],
      namespaces: ['app'],
    });
    expect(s.namespace).toBe('app');
  });
});
