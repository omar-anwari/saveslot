export type RangeResult =
  | { type: "none" }
  | { type: "unsatisfiable" }
  | { type: "range"; start: number; end: number };

const BYTES_PREFIX = "bytes=";

export function parseRangeHeader(
  header: string | null,
  size: number,
): RangeResult {
  if (header === null) return { type: "none" };
  const value = header.trim().toLowerCase();
  if (!value.startsWith(BYTES_PREFIX)) return { type: "none" };
  const spec = value.slice(BYTES_PREFIX.length).trim();
  if (spec.length === 0) return { type: "none" };
  if (spec.includes(",")) return { type: "none" };
  const separator = spec.indexOf("-");
  if (separator < 0) return { type: "none" };
  const rawStart = spec.slice(0, separator).trim();
  const rawEnd = spec.slice(separator + 1).trim();
  if (size === 0) return { type: "unsatisfiable" };
  if (rawStart.length === 0) {
    if (!isDigits(rawEnd)) return { type: "none" };
    const suffix = Number.parseInt(rawEnd, 10);
    if (suffix === 0) return { type: "unsatisfiable" };
    const start = Math.max(size - suffix, 0);
    return { type: "range", start, end: size - 1 };
  }
  if (!isDigits(rawStart)) return { type: "none" };
  const start = Number.parseInt(rawStart, 10);
  if (start >= size) return { type: "unsatisfiable" };
  if (rawEnd.length === 0) {
    return { type: "range", start, end: size - 1 };
  }
  if (!isDigits(rawEnd)) return { type: "none" };
  const requestedEnd = Number.parseInt(rawEnd, 10);
  if (requestedEnd < start) return { type: "unsatisfiable" };
  return { type: "range", start, end: Math.min(requestedEnd, size - 1) };
}

function isDigits(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

export function contentRangeHeader(
  start: number,
  end: number,
  size: number,
): string {
  return `bytes ${start}-${end}/${size}`;
}

export function unsatisfiedRangeHeader(size: number): string {
  return `bytes */${size}`;
}