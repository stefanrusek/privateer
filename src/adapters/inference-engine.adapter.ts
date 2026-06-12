/**
 * Real InferenceEngine adapter — wraps `@huggingface/transformers` running a
 * small quantized instruct ONNX model locally (Spec 07 §11.1). The spec names
 * "Gemma 4 E2B"; the shipped equivalent is Qwen3-0.6B (q4f16, ~550MB), which
 * matches the spec's contract exactly: native function calling via its chat
 * template, structured JSON output, and a generation-time thinking toggle
 * (`enable_thinking`). Models are cached under `~/.config/p9r/models/`.
 *
 * Contains no business logic; the round loop, parser, and prompt assembly all
 * live behind the boundary.
 *
 * Covered by @envtest, not unit tests (src/adapters/** excluded in vitest).
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- SDK tensor/tokenizer types are loose */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- SDK generate() output is untyped */
/* eslint-disable @typescript-eslint/no-unsafe-call -- SDK tokenizer/model methods are loosely typed */
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK lacks precise types */

import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type Result, ok, err } from '../core/result.js';
import type {
  InferenceEngine,
  InferenceRequest,
  InferenceResponse,
  InferenceError,
  ChatMessage,
  ToolDefinition,
  ToolCall,
} from '../boundaries/inference-engine.js';

/**
 * Default model id — Gemma 3n E2B instruction-tuned ONNX (q4 ≈ 3GB). The
 * spec's "Gemma 4 E2B" maps onto Gemma 3n's real E2B variant (Spec 07 §11.1).
 */
const DEFAULT_MODEL_ID = 'onnx-community/gemma-3n-E2B-it-ONNX';

/**
 * Per-model runtime profiles, benchmarked on Apple Silicon (8GB):
 * - Qwen3 on the WebGPU EP runs at ~6 tok/s (CPU is ~6x slower; CoreML
 *   unusable) and its chat template supports native tool calls.
 * - Gemma 3n's multimodal ONNX graph crashes the WebGPU EP outright (a C++
 *   exception that kills the process, not a catchable error), so it pins to
 *   the CPU EP with q4 weights (~0.4 tok/s) and exposes no tools (the Gemma
 *   template has no tool-call format).
 */
interface ModelProfile {
  device: 'webgpu' | 'cpu';
  fallbackDevice: 'cpu' | null;
  dtype: 'q4' | 'q4f16';
  supportsTools: boolean;
  supportsThinking: boolean;
}

function profileFor(modelId: string): ModelProfile {
  if (modelId.toLowerCase().includes('gemma')) {
    return {
      device: 'cpu',
      fallbackDevice: null,
      dtype: 'q4',
      supportsTools: false,
      supportsThinking: false,
    };
  }
  return {
    device: 'webgpu',
    fallbackDevice: 'cpu',
    dtype: 'q4f16',
    supportsTools: true,
    supportsThinking: true,
  };
}

/** Whether the model's chat template accepts tool definitions. */
export function modelSupportsTools(
  modelId: string = DEFAULT_MODEL_ID,
): boolean {
  return profileFor(modelId).supportsTools;
}

/** Where model files live (Spec 07 §11.1 — `~/.config/p9r/models/`). */
export function modelCacheDir(): string {
  return join(homedir(), '.config', 'p9r', 'models');
}

/** Token budgets: thinking mode needs room for the reasoning prefix. */
const MAX_NEW_TOKENS = 128;
const MAX_NEW_TOKENS_THINKING = 768;

export class TransformersInferenceEngine implements InferenceEngine {
  private constructor(
    private readonly tokenizer: any,
    private readonly model: any,
    private readonly profile: ModelProfile,
  ) {}

  /** Resolve the ONNX model + tokenizer for `modelId` from the local cache. */
  static async create(
    modelId: string = DEFAULT_MODEL_ID,
  ): Promise<TransformersInferenceEngine> {
    (env as { cacheDir: string | null }).cacheDir = modelCacheDir();
    const profile = profileFor(modelId);
    const tokenizer = await AutoTokenizer.from_pretrained(modelId);
    let model: any;
    try {
      model = await AutoModelForCausalLM.from_pretrained(modelId, {
        dtype: profile.dtype,
        device: profile.device,
      });
    } catch (e) {
      if (profile.fallbackDevice === null) {
        throw e;
      }
      model = await AutoModelForCausalLM.from_pretrained(modelId, {
        dtype: profile.dtype,
        device: profile.fallbackDevice,
      });
    }
    return new TransformersInferenceEngine(tokenizer, model, profile);
  }

  async generate(
    request: InferenceRequest,
  ): Promise<Result<InferenceResponse, InferenceError>> {
    try {
      const inputs = this.tokenizer.apply_chat_template(
        request.messages.map(toRawMessage),
        {
          ...(this.profile.supportsTools && request.tools.length > 0
            ? { tools: request.tools.map(toTemplateTool) }
            : {}),
          add_generation_prompt: true,
          return_dict: true,
          ...(this.profile.supportsThinking
            ? // Qwen3 chat-template toggle: false pre-fills an empty think block.
              { enable_thinking: request.thinking }
            : {}),
        },
      );

      const promptLength: number = inputs.input_ids.dims.at(-1);
      const output = await this.model.generate({
        ...inputs,
        max_new_tokens: request.thinking
          ? MAX_NEW_TOKENS_THINKING
          : MAX_NEW_TOKENS,
        do_sample: false,
      });

      const newTokens = output.slice(null, [promptLength, null]);
      const decoded: string[] = this.tokenizer.batch_decode(newTokens, {
        skip_special_tokens: true,
      });
      const text = stripCodeFence(stripThinkBlock(decoded[0] ?? ''));

      const toolCalls = extractToolCalls(text);
      return ok({
        content: toolCalls.length > 0 ? '' : text.trim(),
        toolCalls,
      });
    } catch (e) {
      return err({
        kind: 'runtimeError',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Message / tool translation
// ---------------------------------------------------------------------------

function toRawMessage(m: ChatMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls !== undefined) {
    // Qwen3's template renders `tool_call.function.{name,arguments}` and
    // accepts `arguments` as a raw JSON string.
    base.tool_calls = m.toolCalls.map((tc) => ({
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }
  if (m.toolCallId !== undefined) {
    base.tool_call_id = m.toolCallId;
  }
  return base;
}

/** Chat templates expect OpenAI-style `{type:"function", function:{...}}`. */
function toTemplateTool(t: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/** Drop the `<think>…</think>` reasoning prefix (present in thinking mode). */
/**
 * Small models often wrap the JSON action in a markdown code fence; the
 * parser expects bare JSON, so unwrap it here.
 */
function stripCodeFence(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (match?.[1] !== undefined) {
    return match[1].trim();
  }
  return text;
}

function stripThinkBlock(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
}

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

/**
 * Parse `<tool_call>{"name":…,"arguments":…}</tool_call>` blocks emitted by
 * the model into boundary {@link ToolCall}s. Malformed blocks are skipped.
 */
function extractToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of text.matchAll(TOOL_CALL_RE)) {
    const body = match[1];
    if (body === undefined) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== 'object' || parsed === null) {
        continue;
      }
      const record = parsed as Record<string, unknown>;
      const name = record.name;
      if (typeof name !== 'string' || name.length === 0) {
        continue;
      }
      const args = record.arguments ?? {};
      calls.push({
        id: `call-${String(calls.length)}`,
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args),
      });
    } catch {
      // Malformed JSON inside the tag — skip this block.
    }
  }
  return calls;
}
