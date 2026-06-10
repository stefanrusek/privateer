import { type Result, ok, err } from '../core/result.js';
import type {
  InferenceEngine,
  InferenceRequest,
  InferenceResponse,
  InferenceError,
} from './inference-engine.js';

type ScriptedStep =
  | { kind: 'response'; response: InferenceResponse }
  | { kind: 'error'; error: InferenceError };

/**
 * FixtureEngine — replays recorded model outputs in order (Spec 08 §5.4), so the
 * deterministic shell around the non-deterministic model (round loop, parser,
 * AgentTab) is fully covered. Records each request it received for golden-file
 * prompt assertions.
 */
export class FixtureEngine implements InferenceEngine {
  readonly requests: InferenceRequest[] = [];
  private steps: ScriptedStep[] = [];
  private cursor = 0;

  constructor(steps: ScriptedStep[] = []) {
    this.steps = steps;
  }

  generate(
    request: InferenceRequest,
  ): Promise<Result<InferenceResponse, InferenceError>> {
    this.requests.push(request);
    const step = this.steps[this.cursor];
    if (step === undefined) {
      return Promise.resolve(
        err({ kind: 'runtimeError', message: 'fixture exhausted' }),
      );
    }
    this.cursor++;
    if (step.kind === 'error') {
      return Promise.resolve(err(step.error));
    }
    return Promise.resolve(ok(step.response));
  }

  // ---- builders -------------------------------------------------------------

  /** Queue a final-answer (no tool calls) response. */
  pushAnswer(content: string): this {
    this.steps.push({
      kind: 'response',
      response: { toolCalls: [], content },
    });
    return this;
  }

  /** Queue a response that requests tool calls. */
  pushToolCalls(toolCalls: InferenceResponse['toolCalls']): this {
    this.steps.push({
      kind: 'response',
      response: { toolCalls, content: '' },
    });
    return this;
  }

  /** Queue an error result. */
  pushError(error: InferenceError): this {
    this.steps.push({ kind: 'error', error });
    return this;
  }
}
