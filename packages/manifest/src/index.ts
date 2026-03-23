import { readFile, writeFile } from 'node:fs/promises';

export const packageName = '@forge/manifest';

export type ForgeManifest = {
  app?: {
    name: string;
  };
  models: string[];
  controllers: string[];
  routes: unknown[];
  views: string[];
  conventions: Record<string, unknown>;
};

export async function readManifest(manifestPath: string): Promise<ForgeManifest> {
  const contents = await readFile(manifestPath, 'utf8');
  return JSON.parse(contents) as ForgeManifest;
}

export async function writeManifest(manifestPath: string, manifest: ForgeManifest): Promise<void> {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function addModelToManifest(manifest: ForgeManifest, modelName: string): ForgeManifest {
  return {
    ...manifest,
    models: uniqueSorted([...manifest.models, modelName]),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
