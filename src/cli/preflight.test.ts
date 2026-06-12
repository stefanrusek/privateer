import { describe, it, expect } from 'vitest';
import { checkKubectl } from './preflight.js';
import { FakeProcessRunner } from '../boundaries/process-runner.fake.js';

describe('checkKubectl', () => {
  it('resolves ok when kubectl exits 0', async () => {
    const runner = new FakeProcessRunner();
    const promise = checkKubectl(runner);
    runner.last().finish(0);
    expect((await promise).ok).toBe(true);
    expect(runner.last().command).toBe('kubectl');
  });

  it.each([127, null])('reports missing when exit is %s', async (code) => {
    const runner = new FakeProcessRunner();
    const promise = checkKubectl(runner);
    runner.last().finish(code);
    const res = await promise;
    expect(!res.ok && res.error.kind).toBe('kubectlMissing');
  });
});
