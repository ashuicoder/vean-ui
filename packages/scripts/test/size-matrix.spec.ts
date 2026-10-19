import { describe, expect, it } from 'vitest';
import type { WorkspacePackageManifest } from '../src/shared/size';
import {
  publishedSpecifiers,
  renderMatrixConsole,
  renderMatrixMarkdown,
  sortMatrixRows
} from '../src/shared/size-matrix';
import type { SizeMatrixRow } from '../src/shared/size-matrix';

const createManifest = (overrides: Partial<WorkspacePackageManifest> = {}): WorkspacePackageManifest => ({
  dependencies: [],
  dir: '/repo/packages/aria',
  exports: {
    '.': { import: './dist/index.js' },
    './composables': { import: './dist/composables/index.js' },
    './locale/*': { import: './dist/locale/langs/*.js' },
    './*': { import: './dist/components/*/index.js' }
  },
  name: '@vean/aria',
  peerDependencies: [],
  ...overrides
});

describe('publishedSpecifiers', () => {
  it('names the barrel by package name and every subpath by its consumer spelling', () => {
    expect(publishedSpecifiers(createManifest(), { './*': ['select'], './locale/*': ['zh-CN'] })).toEqual([
      '@vean/aria',
      '@vean/aria/composables',
      '@vean/aria/locale/zh-CN',
      '@vean/aria/select'
    ]);
  });

  it('skips a wildcard key that found no built directories', () => {
    // A partial build must shrink the matrix, not throw.
    expect(publishedSpecifiers(createManifest(), { './*': ['select'] })).toEqual([
      '@vean/aria',
      '@vean/aria/composables',
      '@vean/aria/select'
    ]);
  });

  it('keeps a wildcard value containing slashes intact', () => {
    const manifest = createManifest({ exports: { './locale/*': { import: './dist/locale/langs/*.js' } } });

    expect(publishedSpecifiers(manifest, { './locale/*': ['zh-CN'] })).toEqual(['@vean/aria/locale/zh-CN']);
  });
});

describe('sortMatrixRows', () => {
  it('orders by brotli descending, then by specifier for ties', () => {
    const rows: SizeMatrixRow[] = [
      { id: '@vean/aria/b', metrics: { brotli: 10 } },
      { id: '@vean/aria/a', metrics: { brotli: 10 } },
      { id: '@vean/aria', metrics: { brotli: 99 } }
    ];

    expect(sortMatrixRows(rows).map(row => row.id)).toEqual(['@vean/aria', '@vean/aria/a', '@vean/aria/b']);
  });

  it('prefers gzip over raw when both are present, so rows stay comparable', () => {
    const rows: SizeMatrixRow[] = [
      { id: 'raw-heavy', metrics: { gzip: 5, raw: 1000 } },
      { id: 'gzip-medium', metrics: { gzip: 50 } }
    ];

    // raw is only a last resort: mixing metrics in one sort would put an
    // uncompressed row at the top for no useful reason.
    expect(sortMatrixRows(rows).map(row => row.id)).toEqual(['gzip-medium', 'raw-heavy']);
  });
});

describe('matrix rendering', () => {
  const report = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    rows: [
      { id: '@vean/aria', metrics: { brotli: 313344, gzip: 400000, raw: 1200000 } },
      { id: '@vean/aria/select', metrics: { brotli: 20480, gzip: 26000, raw: 90000 } }
    ]
  };

  it('renders every row in the console table, largest first', () => {
    const output = renderMatrixConsole(report);

    expect(output).toContain('2 published entries, largest first:');
    expect(output.indexOf('@vean/aria ')).toBeLessThan(output.indexOf('@vean/aria/select'));
  });

  it('renders a markdown table linkable from the size report', () => {
    const output = renderMatrixMarkdown(report);

    expect(output).toContain('### 📊 Per-entry import cost');
    expect(output).toContain('| `@vean/aria/select` |');
    // The dedup caveat is the one thing a reader must not miss.
    expect(output).toContain('per-entry ceilings, not an app total');
  });
});
