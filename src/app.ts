import { VERSION } from './version.js';
import { parseArgs, type LaunchOptions } from './cli/args.js';
import { completionScript } from './cli/completion.js';

/**
 * Everything the application needs from the outside world, injected as plain
 * interfaces (Spec 08 §6.1). One-shot subcommands only need `write`; launching
 * the TUI is delegated to the injected `launch` callback so the composition
 * root owns the real Ink render and the cluster adapters.
 */
export interface AppDeps {
  readonly write: (line: string) => void;
  readonly argv: readonly string[];
  readonly launch: (options: LaunchOptions) => void;
}

export interface App {
  run(): void;
}

const HELP = `p9r — Privateer, a Kubernetes TUI

Usage:
  p9r [--context <name>] [--namespace <ns>] [--kubeconfig <path>] [--no-agent]
  p9r version
  p9r completion bash|zsh|fish
  p9r help`;

export function createApp(deps: AppDeps): App {
  return {
    run(): void {
      const parsed = parseArgs(deps.argv);
      switch (parsed.kind) {
        case 'version':
          deps.write(`p9r ${VERSION}`);
          return;
        case 'help':
          deps.write(HELP);
          return;
        case 'completion':
          deps.write(completionScript(parsed.shell));
          return;
        case 'error':
          deps.write(`error: ${parsed.message}`);
          deps.write(HELP);
          return;
        case 'launch':
          deps.launch(parsed.options);
          return;
      }
    },
  };
}
