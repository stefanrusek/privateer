/**
 * measured-widgets.tsx — the four measured React wrappers (B04b).
 *
 * Spec: `specs/navigation-overhaul/04-mouse-interaction.md` ("Components in
 * detail" + "Adapter wiring"). These live in `src/adapters/live/` — *not*
 * `src/ui/components/` — by mandate: they touch `ref.current.yogaNode` and run
 * `useEffect`-based measure/register that cannot be meaningfully asserted under
 * `ink-testing-library`. They are coverage-excluded glue, BDD/tmux-exercised.
 *
 * Every *decision* (absolute-rect math, accelerator rendering/matching, the
 * nested-Button winner) lives in pure, fully-covered modules
 * (`src/input/measure.ts`, `src/ui/accelerator.ts`, `src/input/dispatch.ts`);
 * these wrappers only wire refs, effects, and callbacks.
 *
 * Registration target: the controller's `registerMeasured` / `unregisterMeasured`
 * seam. `layer` governs hit-test priority only (Ink has no compositor): an
 * anchored overlay renders *inside* the flex tree but registers on a higher
 * layer so its rows win `topmostAt` and a full-area backdrop entry swallows
 * outside clicks.
 */

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { absoluteRect, type MeasurableNode } from '../../input/measure.js';
import type { Entry, Rect, HandleId } from '../../input/dispatch.js';
import type { FocusRegion } from '../../ui/types.js';
import {
  renderAccelerator,
  type AcceleratorSegment,
} from '../../ui/accelerator.js';

/** The registration surface the wrappers consume (a slice of the controller). */
export interface MeasuredRegistry {
  registerMeasured(entry: Entry, onClick?: () => void): void;
  unregisterMeasured(id: string): void;
}

/** Layer above the base regions (0); overlays sit here so their rows win. */
export const OVERLAY_LAYER = 10;

// ---------------------------------------------------------------------------
// DOMElement → MeasurableNode adapter
// ---------------------------------------------------------------------------

/**
 * Adapt Ink's DOMElement chain to the pure {@link MeasurableNode} shape: walk
 * `parentNode` at the DOM level, reading each node's `yogaNode` computed box.
 * A node missing a `yogaNode` (e.g. a text node) contributes a zero offset and
 * is skipped in the chain. Returns `null` when the element has no yoga node yet
 * (pre-layout), so the caller can wait for the next effect tick.
 */
function toMeasurable(el: DOMElement | undefined): MeasurableNode | null {
  if (el?.yogaNode === undefined) {
    return null;
  }
  const yoga = el.yogaNode;
  const parentEl = el.parentNode ?? undefined;
  return {
    getComputedLeft: () => yoga.getComputedLeft(),
    getComputedTop: () => yoga.getComputedTop(),
    getComputedWidth: () => yoga.getComputedWidth(),
    getComputedHeight: () => yoga.getComputedHeight(),
    get parentNode(): MeasurableNode | null {
      return toMeasurable(parentEl);
    },
  };
}

/**
 * Measure `ref`'s absolute rect (or `null` if not yet laid out). Used by the
 * register effects below; the underlying math is the pure `absoluteRect`.
 */
function measure(ref: React.RefObject<DOMElement | null>): Rect | null {
  const node = toMeasurable(ref.current ?? undefined);
  return node === null ? null : absoluteRect(node);
}

/**
 * Shared measure-and-register effect: measure the ref'd Box after commit and on
 * every relevant change, register the entry, and unregister on unmount. `deps`
 * re-runs the measurement when layout-affecting inputs change (resize handled
 * by the controller re-rendering with a new frame).
 */
function useMeasuredEntry(
  registry: MeasuredRegistry,
  ref: React.RefObject<DOMElement | null>,
  build: (rect: Rect) => Entry,
  onClick: (() => void) | undefined,
  id: string,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const rect = measure(ref);
    if (rect !== null) {
      registry.registerMeasured(build(rect), onClick);
    }
    return () => {
      registry.unregisterMeasured(id);
    };
  }, [registry, ref, id, build, onClick, ...deps]);
}

// ---------------------------------------------------------------------------
// <Button>
// ---------------------------------------------------------------------------

export interface ButtonProps {
  /** Unique registry id (e.g. `tab.yaml`, `detail.close`, `header.context`). */
  id: string;
  /** Fired on click and on the accelerator keypress (interchangeable). */
  onClick: () => void;
  /** Visible label; rendered with the accelerator letter underlined. */
  label?: string;
  /** A single accelerator key (a letter in the label, else a prefix badge). */
  accelerator?: string;
  /** Hit-test layer; default 0 (base). Overlays pass OVERLAY_LAYER. */
  layer?: number;
  /** When given, renders this instead of the label (e.g. the ✕ glyph). */
  children?: ReactNode;
  /** Active-state styling passthrough (e.g. an active tab). */
  active?: boolean;
}

/**
 * A discrete, non-nestable leaf widget. Measures its rendered `<Box>` rect and
 * registers `{ kind:'button', rect, layer, id }` plus its `onClick`; clicking it
 * (or pressing its accelerator, matched by the owning scope) fires `onClick`.
 * **Buttons must not contain Buttons** — the design forbids nesting; the
 * nested-Button winner rule lives in pure `dispatch.pressTarget`.
 */
export function Button({
  id,
  onClick,
  label,
  accelerator,
  layer = 0,
  children,
  active = false,
}: ButtonProps): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useMeasuredEntry(
    registryFromContext(),
    ref,
    (rect) => ({ kind: 'button', id, rect, layer }),
    onClick,
    id,
    [layer, label, accelerator],
  );

  let content: ReactNode;
  if (children !== undefined) {
    content = children;
  } else if (label !== undefined && accelerator !== undefined) {
    content = renderSegments(renderAccelerator(label, accelerator), active);
  } else {
    content = (
      <Text bold={active} underline={active}>
        {label ?? ''}
      </Text>
    );
  }

  return (
    <Box ref={ref} flexDirection="row">
      {content}
    </Box>
  );
}

/** Render accelerator segments as Ink Text runs, underlining the marked one. */
function renderSegments(
  segments: readonly AcceleratorSegment[],
  active: boolean,
): ReactNode {
  return segments.map((seg, i) => (
    <Text key={i} bold={active} underline={seg.underline || active}>
      {seg.text}
    </Text>
  ));
}

// ---------------------------------------------------------------------------
// <FocusableRegion>
// ---------------------------------------------------------------------------

export interface FocusableRegionProps {
  /** The focus-model region this container represents. */
  regionId: FocusRegion;
  /** Absolute rect from `computeFrame` (chunk 02) — no measuring needed. */
  rect: Rect;
  /** Whether this region currently has focus (drives chunk 02's highlight). */
  focused: boolean;
  /** Wheel handler (scrolls this region). */
  onWheel?: (dir: 'up' | 'down') => void;
  children?: ReactNode;
}

/**
 * The root-level focusable layout container (header, detail, command bar). Its
 * rect comes from `computeFrame` as a prop (it does *not* measure); it registers
 * `{ kind:'region', rect, layer:0, region:regionId }`. Clicking it focuses the
 * region via the controller's `focusRegion` action; the wheel over it scrolls
 * it. Keyboard `Tab` focus and mouse focus therefore share one `app.focus`.
 *
 * NB: `onWheel`/`focused` are part of the contract for chunk consumers; the
 * controller already routes wheel by cursor geometry over the frame-derived
 * region entries, so a FocusableRegion need only register its rect.
 */
export function FocusableRegion({
  regionId,
  rect,
  focused: _focused,
  onWheel: _onWheel,
  children,
}: FocusableRegionProps): React.ReactElement {
  const registry = registryFromContext();
  const id = `region.${regionId}`;
  useEffect(() => {
    registry.registerMeasured({
      kind: 'region',
      region: regionId,
      rect,
      layer: 0,
      id,
    });
    return () => {
      registry.unregisterMeasured(id);
    };
  }, [registry, regionId, id, rect.x, rect.y, rect.width, rect.height]);
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// <SelectableList>
// ---------------------------------------------------------------------------

export interface SelectableListProps<T> {
  /** The focus-model region (sidebar or resource list). */
  regionId: FocusRegion;
  /** Inner content rect (already excludes borders). */
  rect: Rect;
  focused: boolean;
  /** The row data. */
  rows: readonly T[];
  /** Scroll offset folded into the local click row → absolute index. */
  scrollOffset: number;
  /** Currently selected absolute index (drives the second-click-opens rule). */
  selectedIndex: number;
  /** Hit-test layer; default 0. Overlay lists pass OVERLAY_LAYER. */
  layer?: number;
  /** Renders one row. */
  renderRow: (row: T, index: number) => ReactNode;
}

/**
 * Composes a focusable region with a row model (the sidebar tree and the
 * resource list, and the overlay list inside a DropdownButton). Registers a
 * `kind:'list'` entry carrying `rowOffset` and `selectedIndex`; the pure
 * dispatcher maps `index = localY + rowOffset` and decides select-vs-open with
 * no geometry of its own. Rows are **not** Buttons — a 200-row list registers
 * one entry, not 200.
 */
export function SelectableList<T>({
  regionId,
  rect,
  focused: _focused,
  rows,
  scrollOffset,
  selectedIndex,
  layer = 0,
  renderRow,
}: SelectableListProps<T>): React.ReactElement {
  const registry = registryFromContext();
  const id = `list.${regionId}`;
  useEffect(() => {
    registry.registerMeasured({
      kind: 'list',
      region: regionId,
      rect,
      layer,
      rowOffset: scrollOffset,
      selectedIndex,
      id,
    });
    return () => {
      registry.unregisterMeasured(id);
    };
  }, [
    registry,
    regionId,
    id,
    layer,
    scrollOffset,
    selectedIndex,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  ]);
  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <React.Fragment key={i}>{renderRow(row, i)}</React.Fragment>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// <DropdownButton>
// ---------------------------------------------------------------------------

export interface DropdownItem {
  /** Stable item id. */
  id: string;
  /** Display label. */
  label: string;
}

export interface DropdownButtonProps {
  /** Unique trigger id (e.g. `header.namespace`, `logs.container`). */
  id: string;
  /** Trigger label (rendered with the accelerator underlined). */
  label: string;
  /** Optional accelerator on the trigger (opens the overlay). */
  accelerator?: string;
  /** The selectable items. */
  items: readonly DropdownItem[];
  /** Currently selected item index. */
  selectedIndex: number;
  /** Fired with the chosen item index. */
  onSelect: (index: number) => void;
  /** Adds a one-line type-to-filter for long/dynamic lists. */
  filterable?: boolean;
}

/**
 * Composition over the primitives: a trigger `<Button>` plus an anchored overlay
 * `<SelectableList>` of item `<Button>`s on the overlay layer. Opening renders
 * the list *inside the flex tree* directly under the trigger (Ink has no
 * compositor; `layer` is hit-test priority only). `filterable` adds a
 * type-to-filter for long lists; a full-area backdrop on the overlay layer
 * swallows outside clicks.
 *
 * The open/filter UI state is local; the *decisions* (which item a key/click
 * picks, item filtering) reuse pure helpers and the controller's dispatcher.
 */
export function DropdownButton({
  id,
  label,
  accelerator,
  items,
  selectedIndex,
  onSelect,
  filterable = false,
}: DropdownButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const triggerRef = useRef<DOMElement>(null);
  const registry = registryFromContext();

  const visible = filterable
    ? items.filter((it) =>
        it.label.toLowerCase().includes(filter.toLowerCase()),
      )
    : items;

  // Anchor the overlay under the trigger's measured rect.
  const triggerRect = open ? measure(triggerRef) : null;
  const anchorRect: Rect | null =
    triggerRect === null
      ? null
      : {
          x: triggerRect.x,
          y: triggerRect.y + 1,
          width: Math.max(triggerRect.width, 12),
          height: visible.length,
        };

  return (
    <Box flexDirection="column">
      <Box ref={triggerRef} flexDirection="row">
        <Trigger
          id={id}
          label={label}
          {...(accelerator !== undefined ? { accelerator } : {})}
          onClick={() => {
            setOpen((o) => !o);
          }}
        />
      </Box>
      {open && anchorRect !== null && (
        <Overlay
          id={id}
          registry={registry}
          rect={anchorRect}
          items={visible}
          selectedIndex={selectedIndex}
          filterable={filterable}
          filter={filter}
          onFilterChange={setFilter}
          onSelect={(index) => {
            const chosen = visible[index];
            if (chosen !== undefined) {
              const realIndex = items.indexOf(chosen);
              onSelect(realIndex);
            }
            setOpen(false);
            setFilter('');
          }}
          onClose={() => {
            setOpen(false);
            setFilter('');
          }}
        />
      )}
    </Box>
  );
}

/** The trigger Button (extracted so the ref'd Box wraps exactly the label). */
function Trigger({
  id,
  label,
  accelerator,
  onClick,
}: {
  id: string;
  label: string;
  accelerator?: string;
  onClick: () => void;
}): React.ReactElement {
  const content =
    accelerator !== undefined ? (
      renderSegments(renderAccelerator(`[${label} ▾]`, accelerator), false)
    ) : (
      <Text>[{label} ▾]</Text>
    );
  // The trigger registers its own button entry via Button so the click opens.
  return (
    <Button
      id={`${id}.trigger`}
      onClick={onClick}
      {...(accelerator !== undefined ? { accelerator } : {})}
    >
      {content}
    </Button>
  );
}

/** The anchored overlay: backdrop + filter line + an item SelectableList. */
function Overlay({
  id,
  registry,
  rect,
  items,
  selectedIndex,
  filterable,
  filter,
  onFilterChange: _onFilterChange,
  onSelect,
  onClose,
}: {
  id: string;
  registry: MeasuredRegistry;
  rect: Rect;
  items: readonly DropdownItem[];
  selectedIndex: number;
  filterable: boolean;
  filter: string;
  onFilterChange: (s: string) => void;
  onSelect: (index: number) => void;
  onClose: () => void;
}): React.ReactElement {
  // Full-area backdrop on the overlay layer swallows outside clicks → close.
  const backdropId = `${id}.backdrop`;
  useEffect(() => {
    registry.registerMeasured(
      {
        kind: 'button',
        id: backdropId,
        rect: { x: 0, y: 0, width: 9999, height: 9999 },
        layer: OVERLAY_LAYER - 1,
      },
      onClose,
    );
    return () => {
      registry.unregisterMeasured(backdropId);
    };
  }, [registry, backdropId, onClose]);

  return (
    <Box flexDirection="column">
      {filterable && <Text dimColor>/{filter}</Text>}
      <SelectableList<DropdownItem>
        regionId="list"
        rect={rect}
        focused
        rows={items}
        scrollOffset={0}
        selectedIndex={selectedIndex}
        layer={OVERLAY_LAYER}
        renderRow={(item, i) => (
          <Button
            id={`${id}.item.${item.id}`}
            onClick={() => {
              onSelect(i);
            }}
            layer={OVERLAY_LAYER}
            active={i === selectedIndex}
            label={item.label}
          />
        )}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Registry context
// ---------------------------------------------------------------------------

const RegistryContext = React.createContext<MeasuredRegistry | null>(null);

/** Provider so the wrappers reach the controller's registration seam. */
export function MeasuredRegistryProvider({
  registry,
  children,
}: {
  registry: MeasuredRegistry;
  children: ReactNode;
}): React.ReactElement {
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

/** Read the registry from context; a no-op fallback keeps render total. */
function registryFromContext(): MeasuredRegistry {
  const ctx = React.useContext(RegistryContext);
  return ctx ?? noopRegistry;
}

const noopRegistry: MeasuredRegistry = {
  registerMeasured: () => undefined,
  unregisterMeasured: () => undefined,
};

export type { Rect, HandleId };
