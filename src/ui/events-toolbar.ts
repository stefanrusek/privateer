/**
 * events-toolbar.ts — accelerator map for the Events tab's `[Warning]`/`[All]`
 * toolbar (P9R-0003).
 *
 * Mirrors `logs-toolbar.ts`'s pattern: the single source of truth for the
 * toolbar's trigger letter, read by both the controller (key routing) and the
 * `?` help overlay / README keymap (via `keymap.ts`) so the advertised key
 * never drifts from the real measured `<Button>`.
 */

/** The Events toolbar control ids — stable registry id and the key of {@link EVENTS_TOOLBAR_ACCELERATORS}. */
export type EventsToolbarId = 'events.filter';

/**
 * The accelerator key for the Events toolbar's filter toggle: `f` cycles
 * Warning ↔ All while the Events tab is active (decided 2026-07-20).
 */
export const EVENTS_TOOLBAR_ACCELERATORS: Readonly<
  Record<EventsToolbarId, string>
> = {
  'events.filter': 'f',
};
