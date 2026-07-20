/**
 * YAML utilities — re-exports all public symbols from the yaml sub-modules.
 * Spec 04 §6: highlight, redact, diff, edit-buffer, validate.
 */

export type { TokenType, Token } from './highlight.js';
export { tokenizeLine } from './highlight.js';

export { maskSecret, revealSecret, SECRET_MASK } from './redact.js';

export type { DiffLine, DiffLineKind } from './diff.js';
export { computeDiff } from './diff.js';

export type { EditBuffer } from './edit-buffer.js';
export { createEditBuffer, EditBufferHandle } from './edit-buffer.js';

export type { YamlValidationError } from './validate.js';
export { validateYaml } from './validate.js';
