import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import { groupCrds } from '../../src/k8s/crd-grouping.js';
import type { CrdGroup } from '../../src/k8s/crd-grouping.js';
import type { CrdDefinition } from '../../src/boundaries/kube-client.js';

interface CrdWorld extends PrivateerWorld {
  crdGroups: CrdGroup[];
}

interface CrdTableRow {
  group: string;
  kind: string;
  plural: string;
  namespaced: string;
}

Given(
  'the following CRD definitions',
  function (this: CrdWorld, dataTable: { hashes(): CrdTableRow[] }) {
    const rows = dataTable.hashes();
    const crds: CrdDefinition[] = rows.map((row) => ({
      group: row.group.trim(),
      kind: row.kind.trim(),
      plural: row.plural.trim(),
      namespaced: row.namespaced.trim() === 'true',
      versions: ['v1'],
    }));
    this.crdGroups = groupCrds(crds);
  },
);

Given('no CRD definitions exist', function (this: CrdWorld) {
  this.crdGroups = groupCrds([]);
});

Then(
  'the sidebar group {string} contains kinds {string}',
  function (this: CrdWorld, groupName: string, kindsStr: string) {
    const expected = kindsStr.split(',').map((s) => s.trim());
    const group = this.crdGroups.find((g) => g.group === groupName);
    assert.ok(group !== undefined, `group "${groupName}" not found`);
    const actual = group.kinds.map((k) => k.kind);
    assert.deepStrictEqual(
      actual.sort(),
      expected.slice().sort(),
      `kinds in group "${groupName}" do not match`,
    );
  },
);

Then('there are no sidebar groups', function (this: CrdWorld) {
  assert.strictEqual(
    this.crdGroups.length,
    0,
    `expected no groups but found ${String(this.crdGroups.length)}`,
  );
});

Then(
  'the sidebar group {string} has kinds in order {string}',
  function (this: CrdWorld, groupName: string, kindsStr: string) {
    const expected = kindsStr.split(',').map((s) => s.trim());
    const group = this.crdGroups.find((g) => g.group === groupName);
    assert.ok(group !== undefined, `group "${groupName}" not found`);
    const actual = group.kinds.map((k) => k.kind);
    assert.deepStrictEqual(
      actual,
      expected,
      `kinds order in group "${groupName}" does not match`,
    );
  },
);
