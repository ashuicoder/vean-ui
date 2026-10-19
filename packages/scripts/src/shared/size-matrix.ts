import { formatBytes } from './size';
import type { SizeMetrics, WorkspacePackageManifest } from './size';

/**
 * Per-entry size matrix for `sui size --matrix`.
 *
 * The checks in `size-budget.json` answer "does the library still fit?". The
 * matrix answers the question a *consumer* asks before adopting a headless
 * library: "what does importing this one component cost me, and what does the
 * barrel cost me?" Every published entry becomes one row, so the difference
 * between `@vean/aria/select` and `@vean/aria` is visible instead of implied.
 *
 * Pure: enumeration works from the manifest plus a caller-supplied map of
 * wildcard expansions (the command reads directories, because that is I/O).
 * Rendering is pure so the report format stays unit-testable.
 *
 * Mirrors reka-ui's `.size-limit.json` approach — per-symbol import cost — with
 * one difference: reka-ui pins a hand-picked list with per-entry budgets, while
 * this enumerates the whole published surface and only reports. A budget per
 * entry would fail on every new component; the bars that matter are the barrel
 * and the gated `consumer/*` checks, both of which `size-budget.json` already
 * carries.
 */

/**
 * Subpaths the matrix skips, with the reason it skips them.
 *
 * `nuxt` and `resolver` are Node-only integration points: they import
 * `@nuxt/kit` / `unplugin-vue-components` at module scope, so a browser-target
 * esbuild pass cannot resolve `node:*` at all. They are never part of what a
 * browser downloads, so measuring them as a browser bundle would produce a
 * number nobody can act on.
 */
const nodeOnlySubpaths = new Set(['./nuxt', './resolver']);

/** CSS entries are measured by a dedicated `file` check in `size-budget.json`. */
const isScriptTarget = (key: string, target: unknown): boolean => {
  const resolved = typeof target === 'string' ? target : null;

  return resolved === null ? true : /\.m?js$/.test(resolved);
};

export interface SizeMatrixRow {
  /** Stable report key — the import specifier a consumer would write. */
  readonly id: string;
  readonly metrics: SizeMetrics;
}

export interface SizeMatrixReport {
  readonly generatedAt: string;
  readonly rows: readonly SizeMatrixRow[];
}

/** Wildcard expansions, keyed by the exports-map key that produced them (`./*`). */
export type WildcardValues = Readonly<Record<string, readonly string[]>>;

/**
 * Every specifier a consumer can import from `manifest`, in exports-map order.
 *
 * Exact keys resolve to their own specifier. A wildcard key expands once per
 * discovered value and is skipped when no values were found — a missing
 * `dist/components` should shrink the matrix, not throw, so `--matrix` can run
 * after a partial build. Node-only integration points and non-JS targets are
 * skipped; see `nodeOnlySubpaths`.
 */
export function publishedSpecifiers(manifest: WorkspacePackageManifest, wildcards: WildcardValues = {}): string[] {
  return Object.entries(manifest.exports).flatMap(([key, target]) => {
    if (nodeOnlySubpaths.has(key) || !isScriptTarget(key, target)) {
      return [];
    }

    if (!key.includes('*')) {
      return [key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`];
    }

    return (wildcards[key] ?? []).map(value => {
      const star = key.indexOf('*');

      return `${manifest.name}${key.slice(1, star)}${value}${key.slice(star + 1)}`;
    });
  });
}

const rowBytes = (row: SizeMatrixRow): number => row.metrics.brotli ?? row.metrics.gzip ?? row.metrics.raw ?? 0;

/** Sort descending by the metric we gate on, so the worst offenders read first. */
export function sortMatrixRows(rows: readonly SizeMatrixRow[]): SizeMatrixRow[] {
  return [...rows].sort((left, right) => rowBytes(right) - rowBytes(left) || left.id.localeCompare(right.id));
}

const pad = (value: string, width: number): string => value.padEnd(width);

/** Aligned console table: wide enough for the longest specifier, capped so it still wraps. */
export function renderMatrixConsole(report: SizeMatrixReport): string {
  const rows = sortMatrixRows(report.rows);
  const idWidth = Math.min(Math.max(0, ...rows.map(row => row.id.length)), 48);

  return [
    `${rows.length} published entries, largest first:`,
    '',
    `${pad('specifier', idWidth)}  ${pad('brotli', 9)}${pad('gzip', 9)}raw`,
    ...rows.map(row =>
      [
        pad(row.id, idWidth),
        pad(formatBytes(row.metrics.brotli ?? 0), 9),
        pad(formatBytes(row.metrics.gzip ?? 0), 9),
        formatBytes(row.metrics.raw ?? 0)
      ].join('  ')
    )
  ].join('\n');
}

export function renderMatrixMarkdown(report: SizeMatrixReport): string {
  return [
    '### 📊 Per-entry import cost',
    '',
    '| specifier | brotli | gzip | raw |',
    '| --- | --- | --- | --- |',
    ...sortMatrixRows(report.rows).map(
      row =>
        `| \`${row.id}\` | ${formatBytes(row.metrics.brotli ?? 0)} | ${formatBytes(row.metrics.gzip ?? 0)} | ${formatBytes(row.metrics.raw ?? 0)} |`
    ),
    '',
    '<sub>Each row bundles one published entry on its own, with the same engine and externals as the budget checks, ' +
      'so dependencies repeat across rows. These are per-entry ceilings, not an app total — a real app deduplicates ' +
      'shared dependencies across the entries it imports.</sub>',
    ''
  ].join('\n');
}
