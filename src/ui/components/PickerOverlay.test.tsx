import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { PickerOverlay, type PickerItem } from './PickerOverlay.js';
import type { PickerOverlayProps } from './PickerOverlay.js';

function makeItems(count: number): PickerItem[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i).padStart(2, '0');
    return { value: `val-${n}`, label: `item-${n}` };
  });
}

function itemLineCount(frame: string): number {
  return (frame.match(/item-\d+/g) ?? []).length;
}

/** A flattened <Text> node with its style props, for style assertions. */
interface CollectedText {
  readonly text: string;
  readonly inverse: boolean;
  readonly dim: boolean;
}

function flattenText(children: React.ReactNode): string {
  let out = '';
  for (const child of React.Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      out += String(child);
    } else if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      out += flattenText(props.children);
    }
  }
  return out;
}

function collectTexts(
  node: React.ReactNode,
  acc: CollectedText[] = [],
): CollectedText[] {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement(child)) {
      continue;
    }
    const props = child.props as {
      children?: React.ReactNode;
      inverse?: boolean;
      dimColor?: boolean;
    };
    if (child.type === Text) {
      acc.push({
        text: flattenText(props.children),
        inverse: props.inverse === true,
        dim: props.dimColor === true,
      });
    } else {
      collectTexts(props.children, acc);
    }
  }
  return acc;
}

/**
 * PickerOverlay is a pure function component, so calling it returns the
 * element tree directly — frames strip ANSI styling in this environment,
 * so inverse/dim assertions inspect the tree instead.
 */
function texts(props: PickerOverlayProps): CollectedText[] {
  return collectTexts(PickerOverlay(props));
}

const basicItems: readonly PickerItem[] = [
  { value: 'default', label: 'default' },
  { value: '', label: '(all namespaces)' },
  { value: 'kube-system', label: 'kube-system' },
];

describe('PickerOverlay', () => {
  it('renders the title and all items when they fit', () => {
    const { lastFrame } = render(
      <PickerOverlay
        title="Select Namespace"
        items={basicItems}
        selectedIndex={0}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Select Namespace');
    expect(frame).toContain('default');
    expect(frame).toContain('(all namespaces)');
    expect(frame).toContain('kube-system');
    expect(frame).not.toContain('↑ …');
    expect(frame).not.toContain('↓ …');
  });

  it('renders the footer hint line dim', () => {
    const { lastFrame } = render(
      <PickerOverlay title="Pick" items={basicItems} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain('↑/↓ select · Enter confirm · Esc cancel');
    const footer = texts({
      title: 'Pick',
      items: basicItems,
      selectedIndex: 0,
    }).find((t) => t.text.includes('Enter confirm'));
    expect(footer?.dim).toBe(true);
  });

  it('renders only the selected row inverse', () => {
    const styled = texts({
      title: 'Pick',
      items: basicItems,
      selectedIndex: 2,
    });
    expect(styled.find((t) => t.text === 'kube-system')?.inverse).toBe(true);
    expect(styled.find((t) => t.text === 'default')?.inverse).toBe(false);
    expect(styled.find((t) => t.text === '(all namespaces)')?.inverse).toBe(
      false,
    );
  });

  it('renders item notes dim as "label  (note)"', () => {
    const items: readonly PickerItem[] = [
      { value: 'app', label: 'app' },
      { value: 'init', label: 'init', note: 'terminated' },
    ];
    const { lastFrame } = render(
      <PickerOverlay title="Containers" items={items} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('init  (terminated)');
    const styled = texts({ title: 'Containers', items, selectedIndex: 0 });
    const note = styled.find((t) => t.text === '  (terminated)');
    expect(note?.dim).toBe(true);
    expect(styled.find((t) => t.text === 'init')?.dim).toBe(false);
  });

  it('shows the filter line with a block cursor when filter is set', () => {
    const { lastFrame } = render(
      <PickerOverlay
        title="Pick"
        items={basicItems}
        selectedIndex={0}
        filter="kube"
      />,
    );
    expect(lastFrame()).toContain('filter: kube█');
  });

  it('shows the filter line for an empty filter string', () => {
    const { lastFrame } = render(
      <PickerOverlay
        title="Pick"
        items={basicItems}
        selectedIndex={0}
        filter=""
      />,
    );
    expect(lastFrame()).toContain('filter: █');
  });

  it('omits the filter line when filter is undefined', () => {
    const { lastFrame } = render(
      <PickerOverlay title="Pick" items={basicItems} selectedIndex={0} />,
    );
    expect(lastFrame()).not.toContain('filter:');
  });

  it('shows a dim "No matches." line for an empty item list', () => {
    const { lastFrame } = render(
      <PickerOverlay title="Pick" items={[]} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain('No matches.');
    const empty = texts({ title: 'Pick', items: [], selectedIndex: 0 }).find(
      (t) => t.text === 'No matches.',
    );
    expect(empty?.dim).toBe(true);
  });

  describe('windowing', () => {
    const items = makeItems(20);

    it('windows at the top: no ↑ indicator, ↓ indicator present', () => {
      const { lastFrame } = render(
        <PickerOverlay
          title="Pick"
          items={items}
          selectedIndex={0}
          maxRows={6}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('item-00');
      expect(frame).toContain('item-03');
      expect(frame).not.toContain('item-04');
      expect(frame).not.toContain('↑ …');
      expect(frame).toContain('↓ …');
    });

    it('windows in the middle: both indicators, centered on the selection', () => {
      const { lastFrame } = render(
        <PickerOverlay
          title="Pick"
          items={items}
          selectedIndex={10}
          maxRows={6}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('↑ …');
      expect(frame).toContain('↓ …');
      expect(frame).toContain('item-08');
      expect(frame).toContain('item-10');
      expect(frame).toContain('item-11');
      expect(frame).not.toContain('item-07');
      expect(frame).not.toContain('item-12');
      const styled = texts({
        title: 'Pick',
        items,
        selectedIndex: 10,
        maxRows: 6,
      });
      expect(styled.find((t) => t.text === 'item-10')?.inverse).toBe(true);
    });

    it('windows at the bottom: ↑ indicator present, no ↓ indicator', () => {
      const { lastFrame } = render(
        <PickerOverlay
          title="Pick"
          items={items}
          selectedIndex={19}
          maxRows={6}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('item-16');
      expect(frame).toContain('item-19');
      expect(frame).not.toContain('item-15');
      expect(frame).toContain('↑ …');
      expect(frame).not.toContain('↓ …');
      const styled = texts({
        title: 'Pick',
        items,
        selectedIndex: 19,
        maxRows: 6,
      });
      expect(styled.find((t) => t.text === 'item-19')?.inverse).toBe(true);
    });

    it('never renders more than maxRows item lines', () => {
      for (const selectedIndex of [0, 5, 10, 19]) {
        const { lastFrame } = render(
          <PickerOverlay
            title="Pick"
            items={items}
            selectedIndex={selectedIndex}
            maxRows={6}
          />,
        );
        expect(itemLineCount(lastFrame() ?? '')).toBeLessThanOrEqual(6);
      }
    });

    it('defaults maxRows to 12 (10 item lines + indicators)', () => {
      const { lastFrame } = render(
        <PickerOverlay title="Pick" items={items} selectedIndex={0} />,
      );
      const frame = lastFrame() ?? '';
      expect(itemLineCount(frame)).toBe(10);
      expect(frame).toContain('item-09');
      expect(frame).not.toContain('item-10');
      expect(frame).toContain('↓ …');
    });

    it('does not window when items.length equals maxRows', () => {
      const exact = makeItems(6);
      const { lastFrame } = render(
        <PickerOverlay
          title="Pick"
          items={exact}
          selectedIndex={0}
          maxRows={6}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(itemLineCount(frame)).toBe(6);
      expect(frame).not.toContain('↑ …');
      expect(frame).not.toContain('↓ …');
    });
  });
});
