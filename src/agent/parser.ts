/**
 * Agent output parser (Spec 07 §6).
 *
 * Parses the model's final assistant message into a typed AgentAction. Handles
 * JSON extraction, validation, and produces 'unknown' on any parse failure.
 */

import type { AgentAction } from '../command/action.js';

// ---------------------------------------------------------------------------
// Parse result
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; action: AgentAction }
  | { ok: false; raw: string };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Attempt to extract and validate a JSON AgentAction from model output. */
export function parseAgentOutput(content: string): ParseResult {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { ok: false, raw: content };
  }

  // Try to extract JSON from the content (model may wrap in markdown code blocks)
  const jsonStr = extractJson(trimmed);
  if (jsonStr === null) {
    return { ok: false, raw: content };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch {
    return { ok: false, raw: content };
  }

  const action = validateAction(parsed);
  if (action === null) {
    return { ok: false, raw: content };
  }

  return { ok: true, action };
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first JSON object from text. Handles:
 *   - Bare JSON objects
 *   - ```json ... ``` code blocks
 *   - ``` ... ``` code blocks
 */
function extractJson(text: string): string | null {
  // Strip markdown code block if present
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (codeBlockMatch !== null) {
    const inner = codeBlockMatch[1];
    if (inner !== undefined) {
      return inner.trim();
    }
  }

  // Try to find the first '{' and match to its closing '}'
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  // Find matching closing brace
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateAction(v: unknown): AgentAction | null {
  if (!isRecord(v)) {
    return null;
  }

  const action = v.action;
  if (typeof action !== 'string') {
    return null;
  }

  switch (action) {
    case 'navigate': {
      const resource = v.resource;
      if (typeof resource !== 'string' || resource.length === 0) {
        return null;
      }
      return { action: 'navigate', resource };
    }

    case 'filter': {
      const result: AgentAction & { action: 'filter' } = { action: 'filter' };
      if (typeof v.namespace === 'string' && v.namespace.length > 0) {
        result.namespace = v.namespace;
      }
      if (typeof v.search === 'string' && v.search.length > 0) {
        result.search = v.search;
      }
      return result;
    }

    case 'answer': {
      const text = v.text;
      if (typeof text !== 'string') {
        return null;
      }
      return { action: 'answer', text };
    }

    case 'multi': {
      const steps = v.steps;
      if (!Array.isArray(steps)) {
        return null;
      }
      const validatedSteps: AgentAction[] = [];
      for (const step of steps) {
        const s = validateAction(step);
        if (s === null) {
          return null;
        }
        validatedSteps.push(s);
      }
      return { action: 'multi', steps: validatedSteps };
    }

    case 'unknown': {
      const raw = v.raw;
      if (typeof raw !== 'string') {
        return null;
      }
      return { action: 'unknown', raw };
    }

    default:
      return null;
  }
}
