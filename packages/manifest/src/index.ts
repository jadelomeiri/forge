import { readFile, writeFile } from 'node:fs/promises';

export const packageName = '@forge/manifest';

export type ForgeManifestRoute = {
  name: string;
  method: string;
  path: string;
  controller?: string;
  action?: string;
  view?: string;
};

export type ForgeManifest = {
  app?: {
    name: string;
  };
  models: string[];
  controllers: string[];
  routes: ForgeManifestRoute[];
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

export function addControllerToManifest(manifest: ForgeManifest, controllerName: string): ForgeManifest {
  return {
    ...manifest,
    controllers: uniqueSorted([...manifest.controllers, controllerName]),
  };
}

export function addRouteDefinitionsToManifest(
  manifest: ForgeManifest,
  routeDefinitions: ForgeManifestRoute[],
): ForgeManifest {
  const routesByKey = new Map<string, ForgeManifestRoute>();

  for (const route of manifest.routes) {
    routesByKey.set(routeKey(route), route);
  }

  for (const route of routeDefinitions) {
    routesByKey.set(routeKey(route), route);
  }

  return {
    ...manifest,
    routes: [...routesByKey.values()].sort(compareRoutes),
  };
}

export function addViewsToManifest(manifest: ForgeManifest, viewNames: string[]): ForgeManifest {
  return {
    ...manifest,
    views: uniqueSorted([...manifest.views, ...viewNames]),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function routeKey(route: ForgeManifestRoute): string {
  return `${route.method}:${route.path}:${route.name}`;
}

function compareRoutes(left: ForgeManifestRoute, right: ForgeManifestRoute): number {
  return routeSortValue(left).localeCompare(routeSortValue(right));
}

function routeSortValue(route: ForgeManifestRoute): string {
  const routeGroup = route.name.includes('.') ? route.name.slice(0, route.name.lastIndexOf('.')) : route.name;
  const actionOrder = route.action ? actionSortValue(route.action) : '00';
  return `${routeGroup}|${actionOrder}|${route.path}|${route.method}|${route.name}`;
}

function actionSortValue(action: string): string {
  const order = ['index', 'new', 'create', 'show', 'edit', 'update', 'delete'];
  const index = order.indexOf(action);
  return String(index === -1 ? 99 : index).padStart(2, '0');
}
