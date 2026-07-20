/**
 * Alternate-screen-buffer control strings (Spec 01 §3.5, P9R-0013).
 *
 * The TUI runs entirely inside the terminal's alternate screen buffer (the
 * same mechanism curses' smcup/rmcup use): entering it means every frame the
 * app draws is invisible to, and never mixes with, the shell's normal
 * scrollback. Leaving it is a single terminal-native operation that instantly
 * restores whatever was on screen before the app started — no manual
 * clearing, no partially-erased frames, no stray lines left behind. This is
 * what makes both halves of P9R-0013 disappear: on quit, leaving the
 * alternate screen makes the whole TUI frame vanish and returns a clean
 * shell prompt; for exec, leaving it before handing the terminal to the PTY
 * (and re-entering after the PTY exits) gives the child process a truly
 * blank, full-size screen instead of drawing underneath/beside the app's
 * last frame.
 */

/** Switch the terminal into its alternate screen buffer. */
export const ENTER_ALT_SCREEN = '\x1b[?1049h';

/** Switch the terminal back to its primary screen buffer. */
export const LEAVE_ALT_SCREEN = '\x1b[?1049l';

/** Make the text cursor visible again (belt-and-suspenders on crash paths). */
export const SHOW_CURSOR = '\x1b[?25h';
