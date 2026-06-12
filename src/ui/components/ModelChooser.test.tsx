import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { ModelChooser, type ModelOption } from './ModelChooser.js';
import type { ModelChooserProps } from './ModelChooser.js';
import { LOGO_LINES, LOGO_TAGLINE } from './Logo.js';

/** A flattened <Text> node with its style props, for style assertions. */
interface CollectedText {
  readonly text: string;
  readonly inverse: boolean;
  readonly bold: boolean;
  readonly dim: boolean;
  readonly color: string | undefined;
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
      bold?: boolean;
      dimColor?: boolean;
      color?: string;
    };
    if (child.type === Text) {
      acc.push({
        text: flattenText(props.children),
        inverse: props.inverse === true,
        bold: props.bold === true,
        dim: props.dimColor === true,
        color: props.color,
      });
    } else {
      collectTexts(props.children, acc);
    }
  }
  return acc;
}

/**
 * ModelChooser is a pure function component, so calling it returns the
 * element tree directly — frames strip ANSI styling in this environment,
 * so inverse/bold/dim assertions inspect the tree instead. Note the nested
 * <Logo /> element is not expanded by this traversal.
 */
function texts(props: ModelChooserProps): CollectedText[] {
  return collectTexts(ModelChooser(props));
}

const options: readonly ModelOption[] = [
  {
    id: 'gemma',
    title: 'Gemma 3n E2B',
    detail: 'Best answers · ~3GB download · CPU inference',
    recommended: true,
  },
  {
    id: 'qwen',
    title: 'Qwen 3 0.6B',
    detail: 'Fastest · ~600MB download',
  },
  {
    id: 'none',
    title: 'No agent',
    detail: 'Skip the local model entirely',
  },
];

describe('ModelChooser', () => {
  it('renders the logo, prompt, and every option title and detail', () => {
    const { lastFrame } = render(
      <ModelChooser options={options} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? '';
    for (const line of LOGO_LINES) {
      expect(frame).toContain(line.trimEnd());
    }
    expect(frame).toContain(LOGO_TAGLINE);
    expect(frame).toContain('Choose your agent model');
    expect(frame).toContain('nothing leaves your machine.');
    for (const option of options) {
      expect(frame).toContain(option.title);
      expect(frame).toContain(option.detail);
    }
  });

  it('renders only the selected row inverse with a "❯ " prefix', () => {
    const styled = texts({ options, selectedIndex: 1 });
    const selected = styled.find((t) => t.text === '❯ Qwen 3 0.6B');
    expect(selected?.inverse).toBe(true);
    const unselected = styled.find((t) => t.text === '  Gemma 3n E2B');
    expect(unselected?.inverse).toBe(false);
    expect(styled.find((t) => t.text === '  No agent')?.inverse).toBe(false);
  });

  it('renders option titles bold and details dim', () => {
    const styled = texts({ options, selectedIndex: 0 });
    expect(styled.find((t) => t.text === '❯ Gemma 3n E2B')?.bold).toBe(true);
    const detail = styled.find((t) => t.text.includes('~3GB download'));
    expect(detail?.dim).toBe(true);
  });

  it('renders a cyan recommended tag only on recommended options', () => {
    const { lastFrame } = render(
      <ModelChooser options={options} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Gemma 3n E2B (recommended for this machine)');
    expect(frame).not.toContain('Qwen 3 0.6B (recommended');
    expect(frame).not.toContain('No agent (recommended');
    const tag = texts({ options, selectedIndex: 0 }).find((t) =>
      t.text.includes('(recommended for this machine)'),
    );
    expect(tag?.color).toBe('cyan');
  });

  it('omits the recommended tag entirely when no option is recommended', () => {
    const plain = options.map(({ id, title, detail }) => ({
      id,
      title,
      detail,
    }));
    const { lastFrame } = render(
      <ModelChooser options={plain} selectedIndex={0} />,
    );
    expect(lastFrame()).not.toContain('(recommended');
  });

  it('renders the dim key-hint footer', () => {
    const { lastFrame } = render(
      <ModelChooser options={options} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↑/↓ select · Enter confirm');
    expect(frame).toContain('~/.config/p9r/config.yaml');
    const footer = texts({ options, selectedIndex: 0 }).find((t) =>
      t.text.includes('you can change this later'),
    );
    expect(footer?.dim).toBe(true);
  });
});
