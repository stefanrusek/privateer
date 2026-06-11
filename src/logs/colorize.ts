/**
 * Heuristic log-level colorization (Spec 05 §3.4). Lines are rendered as plain
 * text — never parsed — but a best-effort color is chosen from substring hints.
 *
 * Precedence (Spec 05 §3.4): error → red, warn → yellow, debug → grey,
 * otherwise white. The substrings are matched case-sensitively for the
 * uppercase forms and the lowercase words `error` / `warn` / `debug` per the
 * spec's explicit list.
 */

/** The color applied to a rendered log line. */
export type LogLineColor = 'red' | 'yellow' | 'grey' | 'white';

/**
 * Classify a log line into a render color using the §3.4 heuristic. The first
 * matching tier wins, evaluated red → yellow → grey → white.
 */
export function colorizeLine(line: string): LogLineColor {
  if (
    line.includes('ERROR') ||
    line.includes('FATAL') ||
    line.includes('error')
  ) {
    return 'red';
  }
  if (
    line.includes('WARNING') ||
    line.includes('WARN') ||
    line.includes('warn')
  ) {
    return 'yellow';
  }
  if (line.includes('DEBUG') || line.includes('debug')) {
    return 'grey';
  }
  return 'white';
}
