import type { CompletionShell } from './args.js';

/** Top-level completions offered for `p9r` (Spec 01 §7). */
const COMMANDS = ['version', 'completion', 'help'];
const FLAGS = ['--context', '--namespace', '--kubeconfig', '--no-agent'];

/** Generate a shell completion script (pure). */
export function completionScript(shell: CompletionShell): string {
  const words = [...COMMANDS, ...FLAGS].join(' ');
  switch (shell) {
    case 'bash':
      return [
        '_p9r() {',
        '  local cur="${COMP_WORDS[COMP_CWORD]}"',
        `  COMPREPLY=( $(compgen -W "${words}" -- "$cur") )`,
        '}',
        'complete -F _p9r p9r',
        '',
      ].join('\n');
    case 'zsh':
      return [
        '#compdef p9r',
        '_p9r() {',
        `  compadd ${words}`,
        '}',
        '_p9r "$@"',
        '',
      ].join('\n');
    case 'fish':
      return [
        ...COMMANDS.map(
          (c) => `complete -c p9r -f -n '__fish_use_subcommand' -a '${c}'`,
        ),
        ...FLAGS.map((f) => `complete -c p9r -l '${f.replace(/^--/, '')}'`),
        '',
      ].join('\n');
  }
}
