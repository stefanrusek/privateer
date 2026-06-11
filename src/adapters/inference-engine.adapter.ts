/**
 * Real InferenceEngine adapter — wraps `@huggingface/transformers` running the
 * Gemma 4 E2B ONNX model (Spec 07 §11.1). Structured JSON / function-calling
 * output, configurable thinking flag. Contains no business logic; the round
 * loop, parser, and prompt assembly all live behind the boundary.
 *
 * Covered by @envtest, not unit tests (src/adapters/** excluded in vitest).
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- SDK pipeline types are loose */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- SDK generate() output is untyped */
/* eslint-disable @typescript-eslint/no-unsafe-call -- SDK pipeline is callable but untyped */
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK lacks precise types */

import { pipeline } from '@huggingface/transformers';
import { type Result, ok, err } from '../core/result.js';
import type {
  InferenceEngine,
  InferenceRequest,
  InferenceResponse,
  InferenceError,
  ChatMessage,
  ToolCall,
} from '../boundaries/inference-engine.js';

/** Default model id — Gemma 4 E2B instruction-tuned ONNX. */
const DEFAULT_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

interface RawToolCall {
  id?: string;
  name?: string;
  function?: { name?: string; arguments?: unknown };
  arguments?: unknown;
}

interface RawMessage {
  role?: string;
  content?: string;
  tool_calls?: RawToolCall[];
}

export class TransformersInferenceEngine implements InferenceEngine {
  private constructor(private readonly generator: any) {}

  /** Resolve the ONNX text-generation pipeline for `modelId`. */
  static async create(
    modelId: string = DEFAULT_MODEL_ID,
  ): Promise<TransformersInferenceEngine> {
    const generator = await pipeline('text-generation', modelId);
    return new TransformersInferenceEngine(generator);
  }

  async generate(
    request: InferenceRequest,
  ): Promise<Result<InferenceResponse, InferenceError>> {
    try {
      const output = await this.generator(request.messages.map(toRawMessage), {
        tools: request.tools,
        do_sample: false,
        // Gemma exposes thinking as a generation-time toggle.
        thinking: request.thinking,
        max_new_tokens: 1024,
      });

      const message = extractMessage(output);
      return ok({
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls: extractToolCalls(message),
      });
    } catch (e) {
      return err({
        kind: 'runtimeError',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

function toRawMessage(m: ChatMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls !== undefined) {
    base.tool_calls = m.toolCalls;
  }
  if (m.toolCallId !== undefined) {
    base.tool_call_id = m.toolCallId;
  }
  return base;
}

function extractMessage(output: any): RawMessage {
  const first = Array.isArray(output) ? output[0] : output;
  const generated = first?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    return (last ?? {}) as RawMessage;
  }
  if (typeof generated === 'string') {
    return { role: 'assistant', content: generated };
  }
  return (first ?? {}) as RawMessage;
}

function extractToolCalls(message: RawMessage): ToolCall[] {
  const raw = message.tool_calls;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((tc, i): ToolCall => {
    const name = tc.function?.name ?? tc.name ?? 'unknown';
    const args = tc.function?.arguments ?? tc.arguments ?? {};
    return {
      id: tc.id ?? `call-${String(i)}`,
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    };
  });
}
