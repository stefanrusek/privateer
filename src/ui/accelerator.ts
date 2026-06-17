/**
 * accelerator.ts — pure label/keypress helpers for discrete-widget accelerators
 * (navigation-overhaul chunk 04 / B04b).
 *
 * Spec: `specs/002-navigation-overhaul/04-mouse-interaction.md` ("accelerator.ts" +
 * "Accelerator keys").
 *
 * A `<Button>`/`<DropdownButton>` may declare an `accelerator`: a single key
 * that is (preferably) a letter within its label. The label renders that letter
 * **underlined** so the key is self-documenting (`[Co̲ntainer ▾]`); pressing the
 * key while the owning region/tab is active fires the same handler a click
 * would. Both helpers here are pure so the chunk-09 help overlay can read the
 * same registry and never advertise a key that drifts from the real one.
 */

/** One run of label text, flagged for whether it renders underlined. */
export interface AcceleratorSegment {
  readonly text: string;
  readonly underline: boolean;
}

/** The accelerator-bearing identity of a button, for keypress matching. */
export interface AcceleratorButton {
  readonly id: string;
  /** The accelerator key, if the button declares one. */
  readonly accelerator?: string;
}

/**
 * Split `label` into render segments with the accelerator letter underlined.
 *
 * If the (case-insensitive) `key` occurs in the label, the **first** occurrence
 * is isolated into its own `underline: true` segment and the surrounding text
 * stays plain. If the key is *not* in the label (e.g. a "Paused"/"Live" toggle),
 * fall back to an underlined **prefix badge** — `key` + `:` + label — so the
 * accelerator is still shown (`q̲:Paused`).
 */
export function renderAccelerator(
  label: string,
  key: string,
): readonly AcceleratorSegment[] {
  const idx = label.toLowerCase().indexOf(key.toLowerCase());
  if (idx === -1) {
    // Fallback: underlined prefix badge.
    return [
      { text: key, underline: true },
      { text: `:${label}`, underline: false },
    ];
  }
  const segments: AcceleratorSegment[] = [];
  if (idx > 0) {
    segments.push({ text: label.slice(0, idx), underline: false });
  }
  segments.push({ text: label.charAt(idx), underline: true });
  if (idx + 1 < label.length) {
    segments.push({ text: label.slice(idx + 1), underline: false });
  }
  return segments;
}

/**
 * Find the id of the button whose accelerator matches `keypress`
 * (case-insensitive), or `null` if none does. Buttons without an accelerator are
 * ignored; on a collision the first matching button wins (accelerators are
 * required to be unique within an active scope, but the helper is total).
 */
export function matchAccelerator(
  buttons: readonly AcceleratorButton[],
  keypress: string,
): string | null {
  const want = keypress.toLowerCase();
  for (const button of buttons) {
    if (button.accelerator?.toLowerCase() === want) {
      return button.id;
    }
  }
  return null;
}
