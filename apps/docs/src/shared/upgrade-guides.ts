import generatedUpgradeGuides from '~/generated/changelog/upgrade-guides.json';
import { resolveContentRoutePath } from './content-route';

export interface UpgradeGuideEntry {
  /**
   * Release the guide documents (e.g. `v0.40.0`). A prerelease suffix is
   * stripped, so a guide attached to a release that is still a beta is titled by
   * the release line it upgrades to, not by the beta build number.
   */
  version: string;
  /** Content path relative to `src/content/{locale}/` (e.g. `ui/migration/v0.40.0`). */
  docPath: string;
  /** Public route path of the guide (e.g. `/overview/migration/v0.40.0`). */
  path: string;
  /**
   * Display label. The release's main guide shows the version alone; secondary
   * guides append their slug so several guides for one release stay apart
   * (e.g. `v0.50.0` / `v0.50.0 · date`).
   */
  label: string;
}

interface GeneratedUpgradeGuide {
  version: string;
  docPath: string;
  label: string;
}

interface GeneratedUpgradeGuideDocument {
  generatedAt: string;
  schemaVersion: number;
  guides: GeneratedUpgradeGuide[];
}

/**
 * Upgrade guides linked from release notes, newest first.
 *
 * `sui gen changelog` flattens the note `docPath` values into a
 * `upgrade-guides.json` of a few hundred bytes. Reading that instead of
 * `releases.json` keeps the 2.3 MB release document out of the first-load graph
 * of every page that renders the sidebar — the sidebar only ever needs this
 * list. The releases page and per-component changelog load the full documents on
 * demand through `~/shared/generated-changelog`.
 */
export function getUpgradeGuides(): UpgradeGuideEntry[] {
  const document = generatedUpgradeGuides as GeneratedUpgradeGuideDocument;

  return document.guides.map(guide => ({
    version: guide.version,
    docPath: guide.docPath,
    path: resolveContentRoutePath(guide.docPath),
    label: guide.label
  }));
}

/** The guide whose `docPath` ends with the given version-ish slug, if any. */
export function findUpgradeGuide(versionOrSlug: string): UpgradeGuideEntry | undefined {
  return getUpgradeGuides().find(
    guide => guide.docPath.endsWith(`/${versionOrSlug}`) || guide.version === versionOrSlug
  );
}
