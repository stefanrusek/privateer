# Failure classes — what the automated gate misses

Bugs that pass `bun run gate` but break the live app cluster into a few classes.
Each entry names the class, why the gate misses it, what to probe, and a real
example from this codebase (all found only by driving the terminal). Use this as
a checklist of *what to look for* during a pass.

## 1. Process lifecycle & teardown

**Why missed:** unit/BDD tests never start and stop the real process or its
child subprocesses. **Probe:** does `q` (and `!q`, `!quit`) actually return the
shell prompt? After quit, is `pgrep -fl 'bin/p9r|port-forward'` empty? Are mouse
modes restored (no `\e[<…` escapes leaking into the shell)? Does Ctrl+C from any
mode exit cleanly?
**Example:** `q` unmounted the UI but the process hung forever — `dispose()`
never closed the Prometheus `kubectl port-forward` child, so the event loop
stayed alive. The screen looked like it quit; the process didn't.

## 2. State staleness

**Why missed:** fakes return deterministic snapshots; tests rarely exercise the
watch→store→view update path under real churn. **Probe:** after a delete, does
the row leave the list (via the watch AND after a manual refresh)? After an
external change, does an edit/apply still succeed? Do measured widgets keep
correct hit-boxes after the layout around them shifts?
**Examples:** (a) a deleted pod's row lingered because refresh only upserted and
never reconciled removals; (b) YAML apply *always* 409'd because it sent the
resourceVersion frozen at edit-open instead of the latest observed one; (c) a
port-forward manager button held a stale rect after a row appeared above it, so
clicks landed a row off.

## 3. Input routing

**Why missed:** tests feed one clean handler at a time; they don't reproduce
competing `useInput` consumers, dispatch ordering, or over-broad filters.
**Probe:** can every dialog be *confirmed* (Enter AND click), not just
cancelled? Does a key meant for one region leak to another? Did a fix that drops
"leaked mouse bytes" also drop a legitimate keystroke?
**Examples:** (a) confirm dialogs accepted only `y`/`n` — Enter and clicking
`[Yes]` did nothing, so you could never confirm a delete/discard/apply; (b) `/`
opened the global pod filter even while the detail pane was focused; (c) a
leaked-mouse filter was too broad and swallowed the literal `[` key, making the
metrics range control a no-op.

## 4. Measured-widget hit-testing

**Why missed:** the Yoga-measured `<Button>`/`<DropdownButton>` layer and the
SGR→registry→dispatch path only fully exist at runtime. **Probe:** click each
control at its *visible* cell and confirm the *specific* effect — clicking tab N
activates tab N (not N±1), ✕ closes, the right dropdown item is chosen, an
accelerator letter fires its own button, a control's handler does its own job.
**Examples:** (a) clicking a list row selected the row *below* (the column-header
row was miscounted as data row 0); (b) clicking a detail tab activated the wrong
tab; (c) `[+ New Forward]` was wired to the *close* handler, so it closed the
manager.

## 5. Rendering

**Why missed:** `ink-testing-library` renders to a string buffer that doesn't
reproduce real terminal/Yoga compositing quirks. **Probe:** read the actual
pane bytes — is the first character of a bordered box's content clipped? Do two
rows overlap when content is present? Is anything clipped past the viewport that
should scroll? Does focus change move any cell it shouldn't?
**Examples:** (a) `borderStyle="double"` boxes clipped the first interior cell,
so the help title rendered "eyboard Reference"; (b) the logs toolbar overlapped
the status row once log lines were present (a wrap/overflow collapse); (c) detail
tabs other than Logs silently clipped tall content instead of scrolling.

## 6. Persistence

**Why missed:** the save path is often debounced or fires on events tests don't
trigger (like process exit). **Probe:** change a setting, quit, relaunch — did it
persist? Inspect the on-disk file (e.g. `~/.config/p9r/layout.json`).
**Example:** per-context namespace+kind memory was never written — it was only
captured on a context *switch* (which never happens with one context) and the
debounced layout save was dropped on quit. Fix: persist on the change *and*
flush synchronously in `dispose()`.

---

## Cross-cutting discipline reminders

These aren't a bug class but they decide whether a pass is trustworthy — the full
version is in `discipline.md`:

- **Verify the specific expected detail.** "Looks fine" misses off-by-ones and
  wrong-tab activations. Assert the exact cell/value/row.
- **Distinguish a real bug from a test-harness artifact.** Two "bugs" this
  session were harness errors: a Unicode-column miscalc clicking the wrong
  button, and a privileged-port fixture that *looked* like broken backspace.
  Reproduce a second time and root-cause in code before reporting.
- **Trust no self-report.** A fix agent reported two click fixes "verified" that
  were still broken. Re-drive independently after a fix; the live terminal is the
  arbiter, not the agent's summary.
