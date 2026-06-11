import { describe, it, expect } from 'vitest';
import { SIDEBAR_CATEGORIES, buildSidebarTree } from './sidebar-data.js';

describe('SIDEBAR_CATEGORIES', () => {
  it('has exactly 8 category groups', () => {
    expect(SIDEBAR_CATEGORIES).toHaveLength(8);
  });

  it('has Workloads category with correct leaves', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'workloads');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Workloads');
    const kinds = cat!.children.map((l) => l.resourceKind);
    expect(kinds).toContain('Deployments');
    expect(kinds).toContain('StatefulSets');
    expect(kinds).toContain('DaemonSets');
    expect(kinds).toContain('ReplicaSets');
    expect(kinds).toContain('Jobs');
    expect(kinds).toContain('CronJobs');
    expect(kinds).toContain('Pods');
  });

  it('has Networking category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'networking');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Networking');
    const kinds = cat!.children.map((l) => l.resourceKind);
    expect(kinds).toContain('Services');
    expect(kinds).toContain('Ingresses');
    expect(kinds).toContain('NetworkPolicies');
    expect(kinds).toContain('Endpoints');
  });

  it('has Configuration category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'configuration');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Configuration');
    const kinds = cat!.children.map((l) => l.resourceKind);
    expect(kinds).toContain('ConfigMaps');
    expect(kinds).toContain('Secrets');
  });

  it('has Storage category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'storage');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Storage');
    const kinds = cat!.children.map((l) => l.resourceKind);
    expect(kinds).toContain('PersistentVolumes');
    expect(kinds).toContain('PersistentVolumeClaims');
    expect(kinds).toContain('StorageClasses');
  });

  it('has Access Control category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'access-control');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Access Control');
    const kinds = cat!.children.map((l) => l.resourceKind);
    expect(kinds).toContain('ServiceAccounts');
    expect(kinds).toContain('Roles');
    expect(kinds).toContain('RoleBindings');
  });

  it('has Nodes category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'nodes');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Nodes');
    expect(cat!.children.map((l) => l.resourceKind)).toContain('Nodes');
  });

  it('has Namespaces category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'namespaces');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Namespaces');
    expect(cat!.children.map((l) => l.resourceKind)).toContain('Namespaces');
  });

  it('has Custom Resources category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'custom-resources');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Custom Resources');
    expect(cat!.children.map((l) => l.resourceKind)).toContain(
      'CustomResourceDefinitions',
    );
  });

  it('every item has kind = category', () => {
    for (const cat of SIDEBAR_CATEGORIES) {
      expect(cat.kind).toBe('category');
    }
  });

  it('every leaf has kind = leaf', () => {
    for (const cat of SIDEBAR_CATEGORIES) {
      for (const leaf of cat.children) {
        expect(leaf.kind).toBe('leaf');
      }
    }
  });
});

describe('buildSidebarTree', () => {
  it('returns the same categories as SIDEBAR_CATEGORIES', () => {
    expect(buildSidebarTree()).toBe(SIDEBAR_CATEGORIES);
  });
});
