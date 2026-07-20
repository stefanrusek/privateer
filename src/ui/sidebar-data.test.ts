import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_CATEGORIES,
  buildSidebarTree,
  flattenSidebarNav,
  buildCrSubgroups,
  sidebarCategoriesWithCr,
  crGroupId,
  CR_GROUP_ID_PREFIX,
} from './sidebar-data.js';
import type { CrdGroup } from '../k8s/crd-grouping.js';

describe('SIDEBAR_CATEGORIES', () => {
  it('has exactly 8 category groups', () => {
    expect(SIDEBAR_CATEGORIES).toHaveLength(8);
  });

  it('has Workloads category with correct leaves', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'workloads');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Workloads');
    const kinds = cat!.children.map((l) =>
      l.kind === 'leaf' ? l.resourceKind : l.id,
    );
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
    const kinds = cat!.children.map((l) =>
      l.kind === 'leaf' ? l.resourceKind : l.id,
    );
    expect(kinds).toContain('Services');
    expect(kinds).toContain('Ingresses');
    expect(kinds).toContain('NetworkPolicies');
    expect(kinds).toContain('Endpoints');
  });

  it('has Configuration category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'configuration');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Configuration');
    const kinds = cat!.children.map((l) =>
      l.kind === 'leaf' ? l.resourceKind : l.id,
    );
    expect(kinds).toContain('ConfigMaps');
    expect(kinds).toContain('Secrets');
  });

  it('has Storage category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'storage');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Storage');
    const kinds = cat!.children.map((l) =>
      l.kind === 'leaf' ? l.resourceKind : l.id,
    );
    expect(kinds).toContain('PersistentVolumes');
    expect(kinds).toContain('PersistentVolumeClaims');
    expect(kinds).toContain('StorageClasses');
  });

  it('has Access Control category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'access-control');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Access Control');
    const kinds = cat!.children.map((l) =>
      l.kind === 'leaf' ? l.resourceKind : l.id,
    );
    expect(kinds).toContain('ServiceAccounts');
    expect(kinds).toContain('Roles');
    expect(kinds).toContain('RoleBindings');
  });

  it('has Nodes category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'nodes');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Nodes');
    expect(
      cat!.children.map((l) => (l.kind === 'leaf' ? l.resourceKind : l.id)),
    ).toContain('Nodes');
  });

  it('has Namespaces category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'namespaces');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Namespaces');
    expect(
      cat!.children.map((l) => (l.kind === 'leaf' ? l.resourceKind : l.id)),
    ).toContain('Namespaces');
  });

  it('has Custom Resources category', () => {
    const cat = SIDEBAR_CATEGORIES.find((c) => c.id === 'custom-resources');
    expect(cat).toBeDefined();
    expect(cat!.label).toBe('Custom Resources');
    expect(
      cat!.children.map((l) => (l.kind === 'leaf' ? l.resourceKind : l.id)),
    ).toContain('CustomResourceDefinitions');
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

describe('flattenSidebarNav', () => {
  it('starts with the overview entry', () => {
    const entries = flattenSidebarNav(SIDEBAR_CATEGORIES, new Set());
    expect(entries[0]).toEqual({ type: 'overview' });
  });

  it('lists each category followed by its leaves when expanded', () => {
    const entries = flattenSidebarNav(SIDEBAR_CATEGORIES, new Set());
    const workloadsIdx = entries.findIndex(
      (e) => e.type === 'category' && e.id === 'workloads',
    );
    expect(workloadsIdx).toBeGreaterThan(0);
    expect(entries[workloadsIdx + 1]).toEqual({
      type: 'leaf',
      resourceKind: 'Deployments',
    });
  });

  it('includes overview, all categories, and all leaves when nothing is collapsed', () => {
    const entries = flattenSidebarNav(SIDEBAR_CATEGORIES, new Set());
    const leafCount = SIDEBAR_CATEGORIES.reduce(
      (sum, cat) => sum + cat.children.length,
      0,
    );
    expect(entries).toHaveLength(1 + SIDEBAR_CATEGORIES.length + leafCount);
  });

  it('omits leaves of collapsed categories but keeps the category entry', () => {
    const entries = flattenSidebarNav(
      SIDEBAR_CATEGORIES,
      new Set(['workloads']),
    );
    expect(
      entries.some((e) => e.type === 'category' && e.id === 'workloads'),
    ).toBe(true);
    expect(
      entries.some((e) => e.type === 'leaf' && e.resourceKind === 'Pods'),
    ).toBe(false);
    // Leaves of other categories remain
    expect(
      entries.some((e) => e.type === 'leaf' && e.resourceKind === 'Services'),
    ).toBe(true);
  });

  it('returns only overview and category entries when everything is collapsed', () => {
    const allIds = new Set(SIDEBAR_CATEGORIES.map((c) => c.id));
    const entries = flattenSidebarNav(SIDEBAR_CATEGORIES, allIds);
    expect(entries).toHaveLength(1 + SIDEBAR_CATEGORIES.length);
    expect(entries.every((e) => e.type !== 'leaf')).toBe(true);
  });

  it('walks subgroups: header always shown, leaves shown only when expanded', () => {
    const crdGroups: CrdGroup[] = [
      {
        group: 'doppler.com',
        kinds: [
          {
            kind: 'DopplerSecret',
            plural: 'dopplersecrets',
            namespaced: true,
            versions: ['v1'],
          },
        ],
      },
    ];
    const categories = sidebarCategoriesWithCr(crdGroups);
    const groupId = crGroupId('doppler.com');

    const collapsedGroup = flattenSidebarNav(categories, new Set([groupId]));
    expect(
      collapsedGroup.some((e) => e.type === 'subgroup' && e.id === groupId),
    ).toBe(true);
    expect(
      collapsedGroup.some(
        (e) => e.type === 'leaf' && e.resourceKind === 'DopplerSecrets',
      ),
    ).toBe(false);

    const expandedGroup = flattenSidebarNav(categories, new Set());
    expect(
      expandedGroup.some(
        (e) => e.type === 'leaf' && e.resourceKind === 'DopplerSecrets',
      ),
    ).toBe(true);
  });

  it('omits a subgroup entirely when its parent category is collapsed', () => {
    const crdGroups: CrdGroup[] = [
      {
        group: 'doppler.com',
        kinds: [
          {
            kind: 'DopplerSecret',
            plural: 'dopplersecrets',
            namespaced: true,
            versions: ['v1'],
          },
        ],
      },
    ];
    const categories = sidebarCategoriesWithCr(crdGroups);
    const entries = flattenSidebarNav(
      categories,
      new Set(['custom-resources']),
    );
    expect(entries.some((e) => e.type === 'subgroup')).toBe(false);
  });
});

describe('crGroupId', () => {
  it('prefixes the group name with the CR-group collapse-key prefix', () => {
    expect(crGroupId('hub.traefik.io')).toBe(
      `${CR_GROUP_ID_PREFIX}hub.traefik.io`,
    );
  });
});

describe('buildCrSubgroups', () => {
  it('returns one subgroup per CRD group, sorted kinds pluralized as leaves', () => {
    const crdGroups: CrdGroup[] = [
      {
        group: 'hub.traefik.io',
        kinds: [
          {
            kind: 'AccessControlPolicy',
            plural: 'accesscontrolpolicies',
            namespaced: true,
            versions: ['v1alpha1'],
          },
        ],
      },
    ];
    const subgroups = buildCrSubgroups(crdGroups);
    expect(subgroups).toHaveLength(1);
    expect(subgroups[0]).toEqual({
      kind: 'subgroup',
      id: 'cr-group:hub.traefik.io',
      label: 'hub.traefik.io',
      children: [
        {
          kind: 'leaf',
          label: 'AccessControlPolicys',
          resourceKind: 'AccessControlPolicys',
        },
      ],
    });
  });

  it('returns an empty array for no groups', () => {
    expect(buildCrSubgroups([])).toEqual([]);
  });
});

describe('sidebarCategoriesWithCr', () => {
  it('returns SIDEBAR_CATEGORIES unchanged when there are no CRD groups', () => {
    expect(sidebarCategoriesWithCr([])).toBe(SIDEBAR_CATEGORIES);
  });

  it('appends CR subgroups beneath the CustomResourceDefinitions leaf', () => {
    const crdGroups: CrdGroup[] = [
      {
        group: 'doppler.com',
        kinds: [
          {
            kind: 'DopplerSecret',
            plural: 'dopplersecrets',
            namespaced: true,
            versions: ['v1'],
          },
        ],
      },
    ];
    const categories = sidebarCategoriesWithCr(crdGroups);
    const cr = categories.find((c) => c.id === 'custom-resources');
    expect(cr).toBeDefined();
    expect(cr!.children[0]).toEqual({
      kind: 'leaf',
      label: 'CustomResourceDefinitions',
      resourceKind: 'CustomResourceDefinitions',
    });
    expect(cr!.children[1]).toEqual({
      kind: 'subgroup',
      id: 'cr-group:doppler.com',
      label: 'doppler.com',
      children: [
        {
          kind: 'leaf',
          label: 'DopplerSecrets',
          resourceKind: 'DopplerSecrets',
        },
      ],
    });
    // Every other category is untouched.
    const workloads = categories.find((c) => c.id === 'workloads');
    expect(workloads).toBe(
      SIDEBAR_CATEGORIES.find((c) => c.id === 'workloads'),
    );
  });
});
