import generatedChangelogIndex from '~/generated/changelog/index.json';

export type GeneratedChangelogEntryType =
  | 'breaking'
  | 'feature'
  | 'fix'
  | 'optimization'
  | 'refactor'
  | 'docs'
  | 'chore'
  | 'style';

export interface GeneratedChangelogEntry {
  type: GeneratedChangelogEntryType;
  scope: string;
  summary: string;
  summaryKey: string | null;
  commitHash: string | null;
  commitUrl: string | null;
  authors: string[];
  source: 'exact-scope' | 'override';
}

export interface GeneratedChangelogVersion {
  version: string;
  compareUrl: string;
  date: string;
  entries: GeneratedChangelogEntry[];
}

export interface GeneratedChangelogDocument {
  component: string;
  generatedAt: string;
  schemaVersion: 1;
  versions: GeneratedChangelogVersion[];
}

export interface GeneratedReleaseChangelogEntry extends GeneratedChangelogEntry {
  components: string[];
}

export type GeneratedReleaseChangelogNoteType = 'breaking' | 'info';

export interface GeneratedReleaseChangelogNote {
  type: GeneratedReleaseChangelogNoteType;
  summary: string;
  summaryKey: string;
  /** Content path of the upgrade guide (e.g. `ui/migration/v0.40.0`), when one exists. */
  docPath?: string;
}

export interface GeneratedReleaseChangelogVersion {
  version: string;
  compareUrl: string;
  date: string;
  entryCount: number;
  componentCount: number;
  components: string[];
  newComponents: string[];
  typeCounts: Partial<Record<GeneratedChangelogEntryType, number>>;
  notes: GeneratedReleaseChangelogNote[];
  entries: GeneratedReleaseChangelogEntry[];
}

export interface GeneratedReleaseChangelogDocument {
  generatedAt: string;
  schemaVersion: 1;
  releases: GeneratedReleaseChangelogVersion[];
}

export interface GeneratedChangelogIndexEntry {
  component: string;
  file: string;
  latestVersion: string | null;
  versionCount: number;
  entryCount: number;
}

interface GeneratedChangelogIndex {
  generatedAt: string;
  schemaVersion: number;
  components: Record<string, GeneratedChangelogIndexEntry>;
}

const componentChangelogLoaders = import.meta.glob<GeneratedChangelogDocument>('../generated/changelog/*.json', {
  import: 'default'
});

/**
 * `releases.json` is 2.3 MB, so it is fetched only by the pages that render it
 * (`/releases` and the release section of the content search). The sidebar and
 * the migration pages read the flattened `upgrade-guides.json` instead — see
 * `~/shared/upgrade-guides`.
 */
const releaseChangelogLoader = () =>
  import('~/generated/changelog/releases.json').then(module => module.default as GeneratedReleaseChangelogDocument);

/** Per-component documents, keyed by component. `index.json`/`releases.json` are not per-component. */
const componentChangelogLoaderByComponent = Object.fromEntries(
  Object.entries(componentChangelogLoaders)
    .filter(([filePath]) => !filePath.endsWith('/index.json') && !filePath.endsWith('/releases.json'))
    .map(([filePath, load]) => [
      filePath
        .split('/')
        .pop()
        ?.replace(/\.json$/u, '') ?? filePath,
      load
    ])
) as Record<string, () => Promise<GeneratedChangelogDocument>>;

const changelogIndex = generatedChangelogIndex as GeneratedChangelogIndex;

/** Loads the changelog for one component, or an empty document when it has none. */
export async function loadComponentChangelogDocument(component: string): Promise<GeneratedChangelogDocument> {
  const load = componentChangelogLoaderByComponent[component];

  if (load) {
    return load();
  }

  return { component, generatedAt: changelogIndex.generatedAt, schemaVersion: 1, versions: [] };
}

export function getComponentChangelogMeta(component: string): GeneratedChangelogIndexEntry {
  return (
    changelogIndex.components[component] ?? {
      component,
      file: `${component}.json`,
      latestVersion: null,
      versionCount: 0,
      entryCount: 0
    }
  );
}

/** Loads the full release changelog. Only `/releases` and the release search need it. */
export async function loadReleaseChangelogDocument(): Promise<GeneratedReleaseChangelogDocument> {
  return releaseChangelogLoader();
}
