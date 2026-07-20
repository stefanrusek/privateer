---
spile: ticket
id: P9R-0012
type: bug
status: verifying
owner: stefan
resolution:
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: []
  supersedes: []
implementation: []
---

# P9R-0012: Secret values are never masked and `v` (reveal) does nothing

## Summary

Secret `data` values must be masked by default in the YAML tab, and `v`
must toggle a revealed view showing *decoded* plaintext. Today the raw
base64 is always displayed (trivially decodable, so effectively exposed —
worst of both worlds) and pressing `v` has no visible effect, though the
keymap, README, and the `[reveal]` toolbar chip all advertise it.

## User Stories

### As a user, I want secrets hidden until I ask

- Given a Secret's YAML tab, when it opens, then each `data:` value renders
  as a fixed mask (e.g. `••••••••`) regardless of value length, and the
  toolbar shows `[reveal]`.
- Given I press `v` or click `[reveal]`, then values render decoded
  (UTF-8 plaintext when decodable, otherwise `<binary, N bytes>`), the chip
  becomes `[hide]`, and pressing `v` again re-masks.
- Given I enter edit mode while masked, then the buffer contains the real
  base64 (edits must round-trip); masking is display-only.
- Given I navigate to a different resource, then the reveal state resets to
  masked.

## Functional Requirements

- Masked is the default for kind Secret everywhere raw data appears
  (YAML tab, and any future overview rendering).
- Reveal shows decoded values, not base64.

## Assumptions

- `stringData` never appears in read paths (server converts).

## Risks

- Accidental shoulder-surf exposure window is the point of the fix.

## Open Questions

- None — decided 2026-07-20: `y` remains resource-name copy only; per-value
  copy is out of scope (see follow-up note).

## Follow-up

Per-value copy (copy the decoded value of a specific `data:` key to the
clipboard) is deliberately excluded: it requires a cursor-over-value
concept the YAML viewer doesn't have. Mint a separate feature ticket when
wanted — likely shape: in a revealed Secret, ↑/↓ move a value cursor and
`y` copies the decoded value under it, with a `✓ Copied <key>` toast and no
logging of the value.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): a doppler token Secret's YAML showed
> `serviceToken: ZHAuc2Eu…` (a live credential, base64) with no masking;
> pressing `v` twice produced no change in the rendered values.
