import { readFile, writeFile } from 'node:fs/promises';

export const packageName = '@forge/manifest';

export const FORGE_FRAMEWORK_NAME = 'forge';
export const FORGE_FRAMEWORK_VERSION = '0.0.0';

export type ForgeManifestRoute = {
  name: string;
  method: string;
  path: string;
  controller?: string;
  action?: string;
  view?: string;
};

export type ForgeManifestResource = {
  name: string;
  model?: string;
  modelFilePath?: string;
  controller?: string;
  controllerFilePath?: string;
  viewsPath?: string;
  routeNames: string[];
};

export type ForgeManifest = {
  app: {
    name: string;
  };
  framework: {
    name: string;
    version: string;
  };
  resources: ForgeManifestResource[];
  models: string[];
  modelFilePaths: string[];
  controllers: string[];
  controllerFilePaths: string[];
  routes: ForgeManifestRoute[];
  views: string[];
  viewPaths: string[];
  conventions: Record<string, unknown>;
};

export async function readManifest(manifestPath: string): Promise<ForgeManifest> {
  const contents = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(contents) as Partial<ForgeManifest>;
  return normalizeManifest(parsed);
}

export async function writeManifest(manifestPath: string, manifest: ForgeManifest): Promise<void> {
  await writeFile(manifestPath, `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`, 'utf8');
}

export function addModelToManifest(manifest: ForgeManifest, modelName: string): ForgeManifest {
  return {
    ...manifest,
    models: uniqueSorted([...manifest.models, modelName]),
  };
}

export function addModelPathToManifest(manifest: ForgeManifest, modelFilePath: string): ForgeManifest {
  return {
    ...manifest,
    modelFilePaths: uniqueSorted([...manifest.modelFilePaths, modelFilePath]),
  };
}

export function addControllerToManifest(manifest: ForgeManifest, controllerName: string): ForgeManifest {
  return {
    ...manifest,
    controllers: uniqueSorted([...manifest.controllers, controllerName]),
  };
}

export function addControllerPathToManifest(manifest: ForgeManifest, controllerFilePath: string): ForgeManifest {
  return {
    ...manifest,
    controllerFilePaths: uniqueSorted([...manifest.controllerFilePaths, controllerFilePath]),
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

export function addViewPathsToManifest(manifest: ForgeManifest, viewPaths: string[]): ForgeManifest {
  return {
    ...manifest,
    viewPaths: uniqueSorted([...manifest.viewPaths, ...viewPaths]),
  };
}

export function upsertResourceInManifest(
  manifest: ForgeManifest,
  resource: Omit<ForgeManifestResource, 'routeNames'> & { routeNames?: string[] },
): ForgeManifest {
  const nextResource: ForgeManifestResource = {
    ...resource,
    routeNames: uniqueSorted(resource.routeNames ?? []),
  };

  const withoutCurrent = manifest.resources.filter((current) => current.name !== nextResource.name);
  const current = manifest.resources.find((entry) => entry.name === nextResource.name);

  const merged: ForgeManifestResource = {
    ...(current ?? { name: nextResource.name, routeNames: [] }),
    ...nextResource,
    routeNames: uniqueSorted([...(current?.routeNames ?? []), ...nextResource.routeNames]),
  };

  return {
    ...manifest,
    resources: [...withoutCurrent, merged].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function normalizeManifest(manifest: Partial<ForgeManifest>): ForgeManifest {
  return {
    app: {
      name: manifest.app?.name ?? 'app',
    },
    framework: {
      name: manifest.framework?.name ?? FORGE_FRAMEWORK_NAME,
      version: manifest.framework?.version ?? FORGE_FRAMEWORK_VERSION,
    },
    resources: normalizeResources(manifest.resources ?? []),
    models: uniqueSorted(manifest.models ?? []),
    modelFilePaths: uniqueSorted(manifest.modelFilePaths ?? []),
    controllers: uniqueSorted(manifest.controllers ?? []),
    controllerFilePaths: uniqueSorted(manifest.controllerFilePaths ?? []),
    routes: [...(manifest.routes ?? [])].sort(compareRoutes),
    views: uniqueSorted(manifest.views ?? []),
    viewPaths: uniqueSorted(manifest.viewPaths ?? []),
    conventions: manifest.conventions ?? {},
  };
}

function normalizeResources(resources: ForgeManifestResource[]): ForgeManifestResource[] {
  const resourcesByName = new Map<string, ForgeManifestResource>();

  for (const resource of resources) {
    const current = resourcesByName.get(resource.name);

    resourcesByName.set(resource.name, {
      ...(current ?? { name: resource.name, routeNames: [] }),
      ...resource,
      routeNames: uniqueSorted([...(current?.routeNames ?? []), ...(resource.routeNames ?? [])]),
    });
  }

  return [...resourcesByName.values()].sort((left, right) => left.name.localeCompare(right.name));
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
