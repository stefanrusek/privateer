/**
 * Kubernetes resource-quantity parsing and humanizing (P9R-0015).
 * Pure functions shared by every surface that renders CPU/memory
 * quantities, so raw values like "264006104Ki" never leak to the UI.
 */

const BINARY_SUFFIXES: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
};

const DECIMAL_SUFFIXES: Record<string, number> = {
  k: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
  P: 1000 ** 5,
};

/** Parse a Kubernetes memory quantity ("123Mi", "1Gi", "12345") to bytes. */
export function parseMemoryBytes(quantity: string): number {
  for (const [suffix, mult] of Object.entries(BINARY_SUFFIXES)) {
    if (quantity.endsWith(suffix)) {
      return Number(quantity.slice(0, -suffix.length)) * mult;
    }
  }
  for (const [suffix, mult] of Object.entries(DECIMAL_SUFFIXES)) {
    if (quantity.endsWith(suffix)) {
      return Number(quantity.slice(0, -suffix.length)) * mult;
    }
  }
  return Number(quantity);
}

/** Parse a Kubernetes CPU quantity ("123m", "1", "12345678n") to millicores. */
export function parseCpuMillicores(quantity: string): number {
  if (quantity.endsWith('n')) {
    return Number(quantity.slice(0, -1)) / 1_000_000;
  }
  if (quantity.endsWith('u')) {
    return Number(quantity.slice(0, -1)) / 1_000;
  }
  if (quantity.endsWith('m')) {
    return Number(quantity.slice(0, -1));
  }
  return Number(quantity) * 1000;
}

/**
 * Humanize a byte count with binary-unit suffixes ("264006106 -> "251.8Mi"),
 * at most one decimal place. Whole numbers drop the decimal ("252Gi").
 */
export function formatBytesHumanized(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  let value = bytes;
  let unit = 'B';
  if (value >= 1024 ** 5) {
    value /= 1024 ** 5;
    unit = 'Pi';
  } else if (value >= 1024 ** 4) {
    value /= 1024 ** 4;
    unit = 'Ti';
  } else if (value >= 1024 ** 3) {
    value /= 1024 ** 3;
    unit = 'Gi';
  } else if (value >= 1024 ** 2) {
    value /= 1024 ** 2;
    unit = 'Mi';
  } else if (value >= 1024) {
    value /= 1024;
    unit = 'Ki';
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${unit}`;
}

/**
 * Humanize a raw Kubernetes memory quantity string ("264006104Ki") into a
 * binary-unit display string ("251.8Gi"). Returns '' for unparseable input.
 */
export function formatMemoryQuantity(quantity: string): string {
  if (quantity === '') {
    return '';
  }
  const bytes = parseMemoryBytes(quantity);
  if (Number.isNaN(bytes)) {
    return '';
  }
  return formatBytesHumanized(bytes);
}

/**
 * Humanize a raw Kubernetes CPU quantity string ("72", "72000m") into whole
 * cores ("72"). Returns '' for unparseable input.
 */
export function formatCpuQuantity(quantity: string): string {
  if (quantity === '') {
    return '';
  }
  const millicores = parseCpuMillicores(quantity);
  if (Number.isNaN(millicores)) {
    return '';
  }
  const cores = millicores / 1000;
  return Number.isInteger(cores) ? String(cores) : cores.toFixed(1);
}
