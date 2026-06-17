/**
 * readme-keymap.test.ts — drift guard for the README keyboard reference (B10).
 *
 * The README documents the keymap between the stable marker comments
 * `<!-- KEYMAP:START -->` / `<!-- KEYMAP:END -->`. That block is GENERATED from
 * {@link renderKeymapMarkdown} (the single keymap registry, chunk 09), so the
 * published docs can never drift from the shipped bindings. This test fails the
 * gate if the committed README block is not byte-equal to the current generator
 * output — regenerate the block (see `scripts/`/this test's failure message)
 * after changing the keymap.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderKeymapMarkdown } from './keymap.js';

const START = '<!-- KEYMAP:START -->';
const END = '<!-- KEYMAP:END -->';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const README_PATH = join(REPO_ROOT, 'README.md');

/** Extract the text strictly between the keymap markers, trimmed of the blank
 * lines the markers sit on. Throws (failing the test loudly) if a marker is
 * missing or out of order. */
function extractKeymapBlock(readme: string): string {
  const startIdx = readme.indexOf(START);
  const endIdx = readme.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `README is missing the ${START} / ${END} keymap markers (or they are out of order)`,
    );
  }
  return readme.slice(startIdx + START.length, endIdx).trim();
}

describe('README keymap block', () => {
  it('is byte-equal to the generated keymap markdown', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    const block = extractKeymapBlock(readme);
    expect(block).toBe(renderKeymapMarkdown());
  });
});
