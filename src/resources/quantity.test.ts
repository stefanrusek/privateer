import { describe, it, expect } from 'vitest';
import {
  parseMemoryBytes,
  parseCpuMillicores,
  formatBytesHumanized,
  formatMemoryQuantity,
  formatCpuQuantity,
} from './quantity.js';

describe('parseMemoryBytes', () => {
  it.each([
    ['plain bytes', '12345', 12345],
    ['Ki', '1Ki', 1024],
    ['Mi', '1Mi', 1024 ** 2],
    ['Gi', '1Gi', 1024 ** 3],
    ['Ti', '1Ti', 1024 ** 4],
    ['Pi', '1Pi', 1024 ** 5],
    ['decimal k', '1k', 1000],
    ['decimal M', '1M', 1000 ** 2],
    ['decimal G', '1G', 1000 ** 3],
    ['decimal T', '1T', 1000 ** 4],
    ['decimal P', '1P', 1000 ** 5],
  ])('%s', (_name, input, expected) => {
    expect(parseMemoryBytes(input)).toBe(expected);
  });
});

describe('parseCpuMillicores', () => {
  it.each([
    ['nanocores', '12000000n', 12],
    ['microcores', '12000u', 12],
    ['millicores', '250m', 250],
    ['whole cores', '2', 2000],
  ])('%s', (_name, input, expected) => {
    expect(parseCpuMillicores(input)).toBe(expected);
  });
});

describe('formatBytesHumanized', () => {
  it.each([
    ['negative -> empty', -1, ''],
    ['NaN -> empty', NaN, ''],
    ['zero bytes', 0, '0B'],
    ['whole Gi, no decimal', 252 * 1024 ** 3, '252Gi'],
    ['fractional Gi, one decimal', 264006104 * 1024, '251.8Gi'],
    ['sub-1Ki stays bytes', 512, '512B'],
    ['exactly 1Ki', 1024, '1Ki'],
    ['whole Mi', 5 * 1024 ** 2, '5Mi'],
    ['whole Ti', 3 * 1024 ** 4, '3Ti'],
    ['caps at Pi', 1024 ** 6, '1024Pi'],
  ])('%s', (_name, input, expected) => {
    expect(formatBytesHumanized(input)).toBe(expected);
  });
});

describe('formatMemoryQuantity', () => {
  it('humanizes a raw Ki quantity string', () => {
    expect(formatMemoryQuantity('264006104Ki')).toBe('251.8Gi');
  });

  it('humanizes a whole Gi quantity', () => {
    expect(formatMemoryQuantity('264241152Ki')).toBe('252Gi');
  });

  it('empty string -> empty', () => {
    expect(formatMemoryQuantity('')).toBe('');
  });

  it('unparseable -> empty', () => {
    expect(formatMemoryQuantity('abcXyz')).toBe('');
  });
});

describe('formatCpuQuantity', () => {
  it('whole cores from plain number', () => {
    expect(formatCpuQuantity('72')).toBe('72');
  });

  it('whole cores from millicore string', () => {
    expect(formatCpuQuantity('72000m')).toBe('72');
  });

  it('fractional cores keep one decimal', () => {
    expect(formatCpuQuantity('1500m')).toBe('1.5');
  });

  it('empty string -> empty', () => {
    expect(formatCpuQuantity('')).toBe('');
  });

  it('unparseable -> empty', () => {
    expect(formatCpuQuantity('abcm')).toBe('');
  });
});
