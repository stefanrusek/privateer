/**
 * YAML validation with line number reporting.
 * Spec 04 §6.2: YAML syntax errors shown inline with line number.
 * Returns null if valid, or a YamlValidationError with the line number.
 */

import jsYaml from 'js-yaml';

export interface YamlValidationError {
  /** Human-readable error message. */
  message: string;
  /** 1-based line number where the error was detected, if available. */
  line: number | null;
}

/**
 * Parse the YAML string and return null if valid.
 * If invalid, returns a YamlValidationError with the error message and
 * line number (1-based) where the error was detected, if js-yaml provides it.
 */
export function validateYaml(content: string): YamlValidationError | null {
  try {
    jsYaml.load(content);
    return null;
  } catch (e) {
    // jsYaml.load always throws YAMLException; cast is safe.
    const ex = e as jsYaml.YAMLException;
    return { message: ex.reason, line: ex.mark.line + 1 };
  }
}
