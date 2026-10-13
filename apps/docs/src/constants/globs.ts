import type { Component } from 'vue';

export interface PlaygroundExampleInfo {
  component: Component;
  code: string;
  name: string;
  order: number | null;
  rawFileName: string;
}

interface PlaygroundExampleEntry {
  code: (() => Promise<{ default: string }>) | null;
  component: () => Promise<{ default: Component }>;
  name: string;
  order: number | null;
  rawFileName: string;
}

const playgroundExampleFileNamePattern = /^(\d{2})-(.+)$/;
const playgroundExampleKeyPattern = /\.\/(?:[^/]+\/)?([^/]+)\/([^/]+)\.vue$/;
const basicExampleName = 'basic';
const ignoredPlaygroundExampleNamePrefix = '_';

// 这两个 glob 刻意保持「非 eager」：`eager: true` 会把 358 个示例 SFC（含 96 个
// 静态 import `playground-gallery` 的示例）全部并进入口 chunk 图，使每个带
// `<UsageCode>` 的 markdown 页都被迫下载近 2 MB 的 playground chunk。
const playgroundComponentLoaders = import.meta.glob<{ default: Component }>('./**/*.vue', {
  base: '../examples'
});

const playgroundCodeLoaders = import.meta.glob<{ default: string }>('./**/*.vue', {
  base: '../examples',
  query: '?raw'
});

/**
 * 按组件名 → 示例名建索引，只保存「加载器」而不触发加载。
 *
 * 每次调用都重建索引（纯计算、无 IO），避免模块级可变缓存让 HMR 拿到过期结果。
 */
function buildPlaygroundExampleIndex(): Record<string, Record<string, PlaygroundExampleEntry>> {
  const index: Record<string, Record<string, PlaygroundExampleEntry>> = {};

  for (const [key, loader] of Object.entries(playgroundComponentLoaders)) {
    const match = key.match(playgroundExampleKeyPattern);

    if (!match) {
      continue;
    }

    const [, componentName, rawFileName] = match;

    if (isIgnoredPlaygroundExample(rawFileName)) {
      continue;
    }

    const { name, order } = parsePlaygroundExampleFileName(rawFileName);

    index[componentName] ??= {};
    index[componentName][name] = {
      code: playgroundCodeLoaders[key] ?? null,
      component: loader,
      name,
      order,
      rawFileName
    };
  }

  return index;
}

/** 按组件名加载全部示例（组件 + 源码），顺序由 {@link comparePlaygroundExamples} 决定。 */
export async function loadPlaygroundExamples(componentName: string): Promise<PlaygroundExampleInfo[]> {
  const entries = Object.values(buildPlaygroundExampleIndex()[componentName] ?? {});

  const examples = await Promise.all(
    entries.map(async entry => ({
      component: (await entry.component()).default,
      code: entry.code ? (await entry.code()).default : '',
      name: entry.name,
      order: entry.order,
      rawFileName: entry.rawFileName
    }))
  );

  return examples.sort(comparePlaygroundExamples);
}

/**
 * 只加载某个示例的源码文本。
 *
 * `UsageCode` 只需要 `?raw` 字符串，因此刻意不碰 component 加载器——否则
 * `<UsageCode>` 会把示例组件（及其 `playground-gallery` 依赖）一并拖进首屏。
 */
export async function loadPlaygroundExampleCode(
  componentName: string,
  exampleName: string
): Promise<string | undefined> {
  const entry = buildPlaygroundExampleIndex()[componentName]?.[exampleName];

  if (!entry?.code) {
    return undefined;
  }

  return (await entry.code()).default;
}

function parsePlaygroundExampleFileName(fileName: string) {
  const match = fileName.match(playgroundExampleFileNamePattern);

  if (!match) {
    return {
      name: fileName,
      order: null
    };
  }

  return {
    name: match[2],
    order: Number(match[1])
  };
}

/**
 * 示例的展示顺序。
 *
 * 显式序号是最强信号：两个示例都带 `NN-` 前缀时按号升序，于是 `00-` 开头的示例
 * （组件自定义器）排在 `01-basic` 前面。`basic` 的置顶规则降级为**兜底**——只在
 * 序号无法裁决时生效（无前缀的 `basic.vue` 仍排在最前），这样现有的 `NN-basic`
 * 示例顺序分毫不变，`UsageCode` 也只按 `name` 取代码，与顺序无关。
 */
function comparePlaygroundExamples(a: PlaygroundExampleInfo, b: PlaygroundExampleInfo) {
  if (a.order !== null && b.order !== null && a.order !== b.order) {
    return a.order - b.order;
  }

  const aIsBasic = a.name === basicExampleName;
  const bIsBasic = b.name === basicExampleName;

  if (aIsBasic !== bIsBasic) {
    return aIsBasic ? -1 : 1;
  }

  if (a.order !== null || b.order !== null) {
    if (a.order === null) {
      return 1;
    }

    if (b.order === null) {
      return -1;
    }
  }

  return a.name.localeCompare(b.name);
}

function isIgnoredPlaygroundExample(name: string) {
  return name === 'index' || name.startsWith(ignoredPlaygroundExampleNamePrefix);
}
