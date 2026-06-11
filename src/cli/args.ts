/**
 * CLI argument parsing (Spec 01 §7). Pure: turns argv into a typed command.
 * `p9r` launches the TUI; `version` and `completion` are one-shot subcommands.
 */
export type ParsedArgs =
  | { kind: 'launch'; options: LaunchOptions }
  | { kind: 'version' }
  | { kind: 'completion'; shell: CompletionShell }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export interface LaunchOptions {
  context?: string;
  namespace?: string;
  kubeconfig?: string;
  noAgent: boolean;
}

export type CompletionShell = 'bash' | 'zsh' | 'fish';

const SHELLS: readonly CompletionShell[] = ['bash', 'zsh', 'fish'];

function isShell(value: string): value is CompletionShell {
  return (SHELLS as readonly string[]).includes(value);
}

/** Parse argv (already stripped of runtime + script path). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [first, ...rest] = argv;

  if (first === 'version' || first === '--version' || first === '-v') {
    return { kind: 'version' };
  }
  if (first === 'help' || first === '--help' || first === '-h') {
    return { kind: 'help' };
  }
  if (first === 'completion') {
    const shell = rest[0];
    if (shell === undefined) {
      return {
        kind: 'error',
        message: 'completion requires a shell: bash|zsh|fish',
      };
    }
    if (!isShell(shell)) {
      return {
        kind: 'error',
        message: `unsupported shell "${shell}" (bash|zsh|fish)`,
      };
    }
    return { kind: 'completion', shell };
  }

  const options: LaunchOptions = { noAgent: false };
  const tokens = [...argv];
  let token = tokens.shift();
  while (token !== undefined) {
    if (token === '--no-agent') {
      options.noAgent = true;
    } else if (
      token === '--context' ||
      token === '--namespace' ||
      token === '--kubeconfig'
    ) {
      const value = tokens.shift();
      if (value === undefined || value.startsWith('--')) {
        return { kind: 'error', message: `${token} requires a value` };
      }
      if (token === '--context') {
        options.context = value;
      } else if (token === '--namespace') {
        options.namespace = value;
      } else {
        options.kubeconfig = value;
      }
    } else {
      return { kind: 'error', message: `unknown argument "${token}"` };
    }
    token = tokens.shift();
  }
  return { kind: 'launch', options };
}
