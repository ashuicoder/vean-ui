import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { buildFixtureSource, resolvePublishedSpecifier, sizeMetrics } from './size';
import type { SizeMetrics, WorkspacePackageManifest } from './size';
import type { SizeMatrixReport, SizeMatrixRow } from './size-matrix';
import { publishedSpecifiers, sortMatrixRows } from './size-matrix';

/**
 * Measurement I/O for `sui size`: reading build output, packing a publishable
 * package, and bundling a consumer-shaped fixture. The rules that turn these
 * numbers into verdicts live in `./size`.
 *
 * Bundle measurements deliberately resolve through each workspace package's
 * `publishConfig.exports` map rather than the in-repo `exports` map, because the
 * latter points at `./src/*.ts`; measuring source instead of the published
 * artifact would silently overstate every number.
 */

const sourceSegment = `${path.sep}src${path.sep}`;

const toRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function readManifest(packageDir: string): WorkspacePackageManifest | null {
  const manifestPath = path.join(packageDir, 'package.json');

  if (!existsSync(manifestPath)) {
    return null;
  }

  const raw = toRecord(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const name = typeof raw.name === 'string' ? raw.name : null;

  if (!name) {
    return null;
  }

  return {
    dependencies: readStringArray(Object.keys(toRecord(raw.dependencies))),
    dir: packageDir,
    // `publishConfig.exports` is what npm consumers resolve; the top-level
    // `exports` map is the in-repo (source) surface for aria and ui.
    exports: toRecord(toRecord(raw.publishConfig).exports ?? raw.exports),
    name,
    peerDependencies: readStringArray(Object.keys(toRecord(raw.peerDependencies)))
  };
}

export function discoverWorkspacePackages(rootDir: string): WorkspacePackageManifest[] {
  const packagesDir = path.join(rootDir, 'packages');

  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => {
      const manifest = readManifest(path.join(packagesDir, entry.name));

      return manifest ? [manifest] : [];
    });
}

export function measureBuffer(buffer: Buffer): SizeMetrics {
  return {
    brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    raw: buffer.length
  };
}

export function measureFileMetrics(filePath: string): SizeMetrics {
  return measureBuffer(readFileSync(filePath));
}

const runCommand = (command: string, args: readonly string[], cwd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr?.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}: ${stderr.trim()}`));
    });
  });

/**
 * Publish-artifact size. `pnpm pack` normalizes mtimes, so the tarball is
 * byte-identical across runs of the same build (verified: stable sha256), which
 * makes it safe to compare across branches.
 */
export async function measurePackMetrics(options: { cacheDir: string; packageDir: string }): Promise<SizeMetrics> {
  const destination = path.join(options.cacheDir, 'pack');

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });

  await runCommand('pnpm', ['pack', '--pack-destination', destination], options.packageDir);

  const archives = readdirSync(destination).filter(fileName => fileName.endsWith('.tgz'));

  if (archives.length !== 1) {
    throw new Error(`expected exactly one tarball from pnpm pack, found ${archives.length} in ${destination}`);
  }

  return { raw: statSync(path.join(destination, archives[0])).size };
}

const isExternalSpecifier = (specifier: string, external: readonly string[]): boolean =>
  external.some(entry => specifier === entry || specifier.startsWith(`${entry}/`));

const createPublishedShapePlugin = (
  manifests: readonly WorkspacePackageManifest[],
  external: readonly string[]
): Plugin => ({
  name: 'vean-ui-published-shape',
  setup(context) {
    context.onResolve({ filter: /^@vean\// }, args => {
      if (isExternalSpecifier(args.path, external)) {
        return null;
      }

      const manifest = manifests.find(entry => args.path === entry.name || args.path.startsWith(`${entry.name}/`));

      if (!manifest) {
        return null;
      }

      const target = resolvePublishedSpecifier(manifest, args.path);

      if (!target) {
        return {
          errors: [
            {
              text: `"${args.path}" is not part of the published surface of ${manifest.name} (publishConfig.exports). Add it to the exports map or drop the import.`
            }
          ]
        };
      }

      if (target.includes(sourceSegment) || target.endsWith('.ts')) {
        return {
          errors: [
            { text: `"${args.path}" resolved to source (${target}); size checks must measure published output.` }
          ]
        };
      }

      if (!existsSync(target)) {
        return {
          errors: [{ text: `"${args.path}" resolved to ${target}, which does not exist. Run \`pnpm build\` first.` }]
        };
      }

      return { path: target };
    });
  }
});

export async function measureBundleMetrics(options: {
  entryPath: string;
  external: readonly string[];
  importClause: string | null;
  manifests: readonly WorkspacePackageManifest[];
  rootDir: string;
}): Promise<SizeMetrics> {
  const result = await build({
    bundle: true,
    external: [...options.external],
    format: 'esm',
    legalComments: 'none',
    logLevel: 'silent',
    minify: true,
    outfile: 'size-fixture.js',
    platform: 'browser',
    plugins: [createPublishedShapePlugin(options.manifests, options.external)],
    stdin: {
      contents: buildFixtureSource({ entryPath: options.entryPath, importClause: options.importClause }),
      loader: 'js',
      resolveDir: options.rootDir,
      sourcefile: 'size-fixture-entry.js'
    },
    target: 'es2020',
    treeShaking: true,
    write: false
  });
  const output = result.outputFiles?.[0];

  if (!output) {
    throw new Error(`esbuild produced no output for ${options.entryPath}`);
  }

  return measureBuffer(Buffer.from(output.contents));
}

export function readEsbuildVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const manifest = toRecord(JSON.parse(readFileSync(require.resolve('esbuild/package.json'), 'utf8')));

    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function readGitCommit(rootDir: string): Promise<string | null> {
  const child = spawn('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] });
  let stdout = '';

  child.stdout?.on('data', chunk => {
    stdout += String(chunk);
  });

  return new Promise(resolve => {
    child.on('error', () => resolve(null));
    child.on('close', code => resolve(code === 0 ? stdout.trim() || null : null));
  });
}

/**
 * Directory names under `parentDir`, sorted. Empty when the directory is absent.
 *
 * Used to expand a `./*` exports pattern into its real values; a partial build
 * should shrink the matrix instead of failing it.
 */
export function listDirectories(parentDir: string): string[] {
  if (!existsSync(parentDir)) {
    return [];
  }

  return readdirSync(parentDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/** File names under `parentDir`, sorted. Empty when the directory is absent. */
export function listFiles(parentDir: string): string[] {
  if (!existsSync(parentDir)) {
    return [];
  }

  return readdirSync(parentDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Expand every `*` exports key against the published target layout.
 *
 * The target is the *published* path (for example `./dist/components/[star]/index.js`),
 * so the directory that gets listed is the built one, not `src`. Internal families
 * (a leading underscore, such as `_common` / `_icon` and the styled package's
 * `__tests__`) are not consumer entry points and are filtered out.
 */
export function expandWildcardExports(manifest: WorkspacePackageManifest): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(manifest.exports)
      .filter(([key]) => key.includes('*'))
      .map(([key, target]) => {
        const resolved = typeof target === 'string' ? target : pickStringTarget(target);

        if (!resolved) {
          return [key, []];
        }

        const star = resolved.indexOf('*');
        const suffix = resolved.slice(star + 1);
        // `*` is either a path segment (`.../components/*/index.js`) or a file name
        // (`.../langs/*.js`). A segment expands to directories, a file name expands
        // to files with the same extension — listing directories for the file form
        // silently yields nothing, which is how the locale entries went missing.
        const isSegment = suffix.startsWith('/');
        const directory = path.resolve(manifest.dir, path.dirname(resolved.slice(0, star + 1)));
        const extension = isSegment ? '' : suffix;
        const values = isSegment
          ? listDirectories(directory)
          : listFiles(directory).flatMap(name =>
              name.endsWith(extension) ? [name.slice(0, name.length - extension.length)] : []
            );

        return [key, values.filter(name => !name.startsWith('_') && !name.startsWith('.'))];
      })
  );
}

const pickStringTarget = (value: unknown): string | null => {
  const record = toRecord(value);

  return (
    (['import', 'module', 'default', 'require'] as const)
      .map(field => record[field])
      .find((target): target is string => typeof target === 'string') ?? null
  );
};

/**
 * Measure one published entry point as an isolated consumer import.
 *
 * Same engine, externals and fixture shape as `measureBundleMetrics`, so a
 * matrix row and its equivalent budget check are directly comparable. `deps:
 * 'bundled'` is deliberate: the row must answer "what does this entry pull into
 * my app", which is the whole point of a per-entry matrix.
 */
export async function measureEntryMetrics(options: {
  external: readonly string[];
  manifest: WorkspacePackageManifest;
  manifests: readonly WorkspacePackageManifest[];
  rootDir: string;
  specifier: string;
}): Promise<SizeMetrics> {
  const entryPath = resolvePublishedSpecifier(options.manifest, options.specifier);

  if (!entryPath || !existsSync(entryPath)) {
    // A wildcard value with no built output: report it as empty rather than
    // failing the whole run, so `--matrix` works on a partial build.
    return {};
  }

  return measureBundleMetrics({
    entryPath,
    external: [...options.external],
    importClause: null,
    manifests: options.manifests,
    rootDir: options.rootDir
  });
}

/**
 * Build the per-entry matrix for every publishable workspace package.
 *
 * Sequential on purpose: each row is a full esbuild pass, and running them
 * concurrently makes the numbers jitter on a loaded machine. Runtime is roughly
 * one bundle per entry (~15 ms each at the current surface size).
 */
export async function measureSizeMatrix(options: {
  external: readonly string[];
  manifests: readonly WorkspacePackageManifest[];
  /** Package names to enumerate, in order. Empty yields an empty matrix. */
  packageNames: readonly string[];
  rootDir: string;
}): Promise<SizeMatrixReport> {
  const rows: SizeMatrixRow[] = [];
  const selected = options.packageNames.flatMap(name => {
    const manifest = options.manifests.find(entry => entry.name === name);

    return manifest ? [manifest] : [];
  });

  for (const manifest of selected) {
    const wildcards = expandWildcardExports(manifest);

    for (const specifier of publishedSpecifiers(manifest, wildcards)) {
      rows.push({
        id: specifier,
        metrics: await measureEntryMetrics({ ...options, manifest, specifier })
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    rows: sortMatrixRows(rows.filter(row => sizeMetrics.some(metric => typeof row.metrics[metric] === 'number')))
  };
}
