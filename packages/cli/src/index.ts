#!/usr/bin/env node

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, readlink, realpath, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createForgeApp } from '@forge/create-forge-app';
import { generateModel, generateScaffold, parseModelMetadata } from '@forge/generators';
import { readManifest, type ForgeManifest } from '@forge/manifest';
import {
  ForgeApp,
  loadRoutesConfig,
  registerRoutesFromConfig,
  type ForgeRoutesConfigEntry,
} from '@forge/runtime';
import { parseCommand, renderCommandHelp } from './commands.js';

export function run(argv: string[] = process.argv.slice(2)): number | Promise<number> {
  const result = parseCommand(argv);

  if (result.kind === 'help') {
    console.log(result.text);
    return 0;
  }

  if (result.kind === 'error') {
    console.error(result.text);
    return 1;
  }

  if (result.command.name === 'new') {
    return runNewCommand(result.command.args);
  }

  if (result.command.name === 'generate model') {
    return runGenerateModelCommand(result.command.args);
  }

  if (result.command.name === 'generate scaffold') {
    return runGenerateScaffoldCommand(result.command.args);
  }

  if (result.command.name === 'dev') {
    return runDevCommand(result.command.args);
  }

  if (result.command.name === 'migrate') {
    return runMigrateCommand(result.command.args);
  }

  if (result.command.name === 'explain model') {
    return runExplainModelCommand(result.command.args);
  }

  if (result.command.name === 'explain route') {
    return runExplainRouteCommand(result.command.args);
  }

  console.error(`Unknown command handler: ${result.command.name}`);
  return 1;
}

async function runGenerateModelCommand(args: string[]): Promise<number> {
  const [modelName, ...fieldArgs] = args;

  if (!modelName) {
    console.error(
      [
        'Failed to generate model: missing model name.',
        'Expected convention: forge generate model <ModelName> [field:type ...].',
        'Try: forge generate model Post title:string body:text',
        '',
        renderCommandHelp('generate model'),
      ].join('\n'),
    );
    return 1;
  }

  try {
    const result = await generateModel({
      projectRoot: process.cwd(),
      modelName,
      fieldArgs,
    });

    console.log(renderSuccessMessage('Model generated', [
      `Model: ${result.modelName}`,
      `File: ${result.modelFilePath}`,
      `Schema: ${result.schemaPath}`,
      `Manifest: ${result.manifestPath}`,
      '',
      'Fields:',
      ...(result.fields.length > 0
        ? result.fields.map((field) => `- ${field.name}:${field.type}`)
        : ['- (none)']),
    ]));

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to generate model: ${message}`);
    return 1;
  }
}

async function runGenerateScaffoldCommand(args: string[]): Promise<number> {
  const [name, ...extraArgs] = args;

  if (!name) {
    console.error(
      [
        'Failed to generate scaffold: missing model name.',
        'Expected convention: forge generate scaffold <ModelName>.',
        'Try: forge generate scaffold Post',
        '',
        renderCommandHelp('generate scaffold'),
      ].join('\n'),
    );
    return 1;
  }

  if (extraArgs.length > 0) {
    console.error(`Unexpected arguments: ${extraArgs.join(', ')}\n\n${renderCommandHelp('generate scaffold')}`);
    return 1;
  }

  try {
    const result = await generateScaffold({
      projectRoot: process.cwd(),
      name,
    });

    console.log(renderSuccessMessage('Scaffold generated', [
      `Resource: ${result.resourceName}`,
      `Controller: ${result.controllerFilePath}`,
      `Routes: ${result.routesPath}`,
      `Manifest: ${result.manifestPath}`,
      '',
      'Tests:',
      ...result.testFilePaths.map((testFilePath) => `- ${testFilePath}`),
      '',
      'Views:',
      ...result.viewPaths.map((viewPath) => `- ${viewPath}`),
    ]));

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to generate scaffold: ${message}`);
    return 1;
  }
}

async function runNewCommand(args: string[]): Promise<number> {
  const [appName, ...extraArgs] = args;

  if (!appName) {
    console.error(
      [
        'Failed to create app: missing app name.',
        'Expected convention: forge new <app-name>.',
        'Try: forge new blog-app',
        '',
        renderCommandHelp('new'),
      ].join('\n'),
    );
    return 1;
  }

  if (extraArgs.length > 0) {
    console.error(`Unexpected arguments: ${extraArgs.join(', ')}\n\n${renderCommandHelp('new')}`);
    return 1;
  }

  try {
    const result = await createForgeApp({
      appName,
      destinationRoot: process.cwd(),
    });

    console.log(renderSuccessMessage('Forge app created', [
      `App: ${result.appName}`,
      `Location: ${result.appRoot}`,
      '',
      'Created files:',
      ...result.files.map((file: string) => `- ${file}`),
      '',
      'Next steps:',
      `- cd ${result.appName}`,
      '- forge generate model Post title:string body:text',
      '- forge generate scaffold Post',
      '- forge migrate',
      '- forge dev',
    ]));

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to create app: ${message}`);
    return 1;
  }
}

export type ForgeMigrateDependencies = {
  cwd(): string;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  access(path: string): Promise<void>;
  runCommand(command: string, args: string[], options: { cwd: string }): Promise<void>;
};

export type ForgeExplainModelDependencies = {
  cwd(): string;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  access(path: string): Promise<void>;
  readManifest(path: string): Promise<ForgeManifest>;
};

export type ForgeExplainRouteDependencies = {
  cwd(): string;
  readManifest(path: string): Promise<ForgeManifest>;
};

export type ForgeDevDependencies = {
  cwd(): string;
  prepareProject?(projectRoot: string): Promise<void>;
  loadRoutesConfig(rootDir: string): Promise<readonly ForgeRoutesConfigEntry[]>;
  registerRoutes(app: ForgeApp, routes: readonly ForgeRoutesConfigEntry[], rootDir: string): Promise<void>;
  boot(app: ForgeApp): Promise<{ host: string; port: number }>;
};

const defaultMigrateDependencies: ForgeMigrateDependencies = {
  cwd: () => process.cwd(),
  readFile,
  access,
  runCommand(command, args, options) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: 'inherit',
      });

      child.on('error', reject);
      child.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Command failed with exit code ${code ?? 'unknown'}.`));
      });
    });
  },
};

const defaultExplainModelDependencies: ForgeExplainModelDependencies = {
  cwd: () => process.cwd(),
  readFile,
  access,
  readManifest,
};

const defaultExplainRouteDependencies: ForgeExplainRouteDependencies = {
  cwd: () => process.cwd(),
  readManifest,
};

const defaultDevDependencies: ForgeDevDependencies = {
  cwd: () => process.cwd(),
  prepareProject: ensureGeneratedAppPackageLinks,
  loadRoutesConfig,
  async registerRoutes(app, routes, rootDir) {
    await registerRoutesFromConfig(app, routes, { rootDir });
  },
  boot(app) {
    return app.boot({ host: '127.0.0.1', port: 3000 });
  },
};

export async function runDevCommand(
  args: string[],
  dependencies: ForgeDevDependencies = defaultDevDependencies,
): Promise<number> {
  if (args.length > 0) {
    console.error(`Unexpected arguments: ${args.join(', ')}\n\n${renderCommandHelp('dev')}`);
    return 1;
  }

  const projectRoot = dependencies.cwd();
  if (dependencies.prepareProject) {
    await dependencies.prepareProject(projectRoot);
  }
  const app = new ForgeApp({ rootDir: projectRoot });

  try {
    const routes = await dependencies.loadRoutesConfig(projectRoot);
    await dependencies.registerRoutes(app, routes, projectRoot);
    const server = await dependencies.boot(app);

    console.log(renderSuccessMessage('Dev server running', [
      `URL: http://${server.host}:${server.port}`,
      `Root: ${projectRoot}`,
      'Press Ctrl+C to stop.',
    ]));

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to start dev server: ${message}`);
    return 1;
  }
}

export async function ensureGeneratedAppPackageLinks(projectRoot: string): Promise<void> {
  const cliDistDir = path.dirname(fileURLToPath(import.meta.url));
  const workspacePackagesDir = path.resolve(cliDistDir, '..', '..');
  const forgeScopeDir = path.join(projectRoot, 'node_modules', '@forge');
  const linkedPackages: Array<{ packageName: string; packagePath: string }> = [
    { packageName: 'core', packagePath: path.join(workspacePackagesDir, 'core') },
    { packageName: 'runtime', packagePath: path.join(workspacePackagesDir, 'runtime') },
  ];

  await mkdir(forgeScopeDir, { recursive: true });

  for (const linkedPackage of linkedPackages) {
    await access(path.join(linkedPackage.packagePath, 'dist', 'index.js'));
    const linkPath = path.join(forgeScopeDir, linkedPackage.packageName);
    await ensureDirectorySymlink(linkPath, linkedPackage.packagePath);
  }
}

async function ensureDirectorySymlink(linkPath: string, targetPath: string): Promise<void> {
  const normalizedTargetPath = path.resolve(targetPath);

  try {
    const stats = await lstat(linkPath);

    if (stats.isSymbolicLink()) {
      const existingLink = await readlink(linkPath);
      const resolvedExistingTarget = path.resolve(path.dirname(linkPath), existingLink);
      const canonicalExistingTarget = await realpath(resolvedExistingTarget);
      const canonicalTargetPath = await realpath(normalizedTargetPath);

      if (canonicalExistingTarget === canonicalTargetPath) {
        return;
      }
    }

    await rm(linkPath, { recursive: true, force: true });
  } catch {
    // Create link when it does not exist.
  }

  await symlink(normalizedTargetPath, linkPath, 'dir');
}

export async function runExplainModelCommand(
  args: string[],
  dependencies: ForgeExplainModelDependencies = defaultExplainModelDependencies,
): Promise<number> {
  const [modelName, ...extraArgs] = args;

  if (!modelName) {
    console.error(
      [
        'Failed to explain model: missing model name.',
        'Expected convention: forge explain model <ModelName>.',
        'Try: forge explain model Post',
        '',
        renderCommandHelp('explain model'),
      ].join('\n'),
    );
    return 1;
  }

  if (extraArgs.length > 0) {
    console.error(`Unexpected arguments: ${extraArgs.join(', ')}\n\n${renderCommandHelp('explain model')}`);
    return 1;
  }

  const projectRoot = dependencies.cwd();
  const manifestPath = path.join(projectRoot, '.forge/manifest.json');

  let manifest: ForgeManifest;

  try {
    manifest = await dependencies.readManifest(manifestPath);
  } catch {
    console.error([
      'Failed to explain model: Forge manifest file is missing or unreadable.',
      `Path: ${manifestPath}`,
      'Expected convention: .forge/manifest.json exists in the project root.',
      'Try: run forge new to create a Forge app, or re-run the generator that should create the manifest.',
    ].join('\n'));
    return 1;
  }

  const modelInfo = resolveModelInfo(modelName, manifest);

  if (!modelInfo) {
    console.error([
      `Failed to explain model: model "${modelName}" was not found in the manifest.`,
      `Path: ${manifestPath}`,
      'Expected convention: the model is listed in .forge/manifest.json (models/resources).',
      `Try: run forge generate model ${modelName} ... before explain.`,
    ].join('\n'));
    return 1;
  }

  const modelFilePath = path.join(projectRoot, modelInfo.modelFilePath);

  try {
    await dependencies.access(modelFilePath);
  } catch {
    console.error([
      'Failed to explain model: model file is missing.',
      `Path: ${modelFilePath}`,
      'Expected convention: app/models/<model-name>.model.ts exists for manifest entries.',
      `Try: restore the file or re-run forge generate model ${modelName} ...`,
    ].join('\n'));
    return 1;
  }

  const modelSource = await dependencies.readFile(modelFilePath, 'utf8');
  const modelMetadata = parseModelMetadata(modelSource, modelName);
  const fieldLines = modelMetadata.fields.map((field) => `- ${field.name}: ${field.type}`);
  const defaults = modelMetadata.fields.filter((field) => field.default !== undefined);
  const defaultLines = defaults.map((field) => `- ${field.name}: ${String(field.default)}`);
  const required = modelMetadata.fields.filter((field) => field.required);
  const validationLines = required.map((field) => `- ${field.name}: required`);
  const linkageLines = [
    `- resource: ${modelInfo.resourceName}`,
    ...(modelInfo.controller ? [`- controller: ${modelInfo.controller}`] : []),
    ...(modelInfo.controllerFilePath ? [`- controller file: ${modelInfo.controllerFilePath}`] : []),
  ];
  const viewsLine = modelInfo.viewsPath ? [modelInfo.viewsPath] : [];

  console.log([
    `Model: ${modelName}`,
    `File path: ${modelInfo.modelFilePath}`,
    '',
    'Fields:',
    ...formatExplainLines(fieldLines),
    '',
    'Defaults:',
    ...formatExplainLines(defaultLines),
    '',
    'Validations:',
    ...formatExplainLines(validationLines),
    '',
    'Scaffold/controller linkage:',
    ...formatExplainLines(linkageLines),
    '',
    'Views path:',
    ...formatExplainLines(viewsLine),
    '',
    'Route names:',
    ...formatExplainLines(modelInfo.routeNames.map((name) => `- ${name}`)),
  ].join('\n'));

  return 0;
}

export async function runExplainRouteCommand(
  args: string[],
  dependencies: ForgeExplainRouteDependencies = defaultExplainRouteDependencies,
): Promise<number> {
  const [pathOrName, ...extraArgs] = args;

  if (!pathOrName) {
    console.error(
      [
        'Failed to explain route: missing route path or name.',
        'Expected convention: forge explain route <route-name|/path>.',
        'Try: forge explain route posts.show',
        '',
        renderCommandHelp('explain route'),
      ].join('\n'),
    );
    return 1;
  }

  if (extraArgs.length > 0) {
    console.error(`Unexpected arguments: ${extraArgs.join(', ')}\n\n${renderCommandHelp('explain route')}`);
    return 1;
  }

  const projectRoot = dependencies.cwd();
  const manifestPath = path.join(projectRoot, '.forge/manifest.json');

  let manifest: ForgeManifest;

  try {
    manifest = await dependencies.readManifest(manifestPath);
  } catch {
    console.error([
      'Failed to explain route: Forge manifest file is missing or unreadable.',
      `Path: ${manifestPath}`,
      'Expected convention: .forge/manifest.json exists in the project root.',
      'Try: run forge new to create a Forge app, or re-run generators to rebuild the manifest.',
    ].join('\n'));
    return 1;
  }

  const route = resolveRoute(pathOrName, manifest.routes);

  if (!route) {
    console.error([
      `Failed to explain route: route "${pathOrName}" was not found.`,
      `Path: ${manifestPath}`,
      'Expected convention: route exists in manifest.routes with a valid name/path.',
      'Try: run forge generate scaffold <ModelName> or check config/routes.ts and regenerate manifest entries.',
    ].join('\n'));
    return 1;
  }

  const controllerAction = formatControllerAction(route);
  const controllerFile = resolveControllerFilePath(route, manifest);
  const view = resolveRenderedView(route, manifest);

  console.log([
    `Route: ${route.name}`,
    `Method: ${route.method}`,
    `Path: ${route.path}`,
    `Controller action: ${controllerAction}`,
    `Controller file: ${controllerFile ?? '(none)'}`,
    `Rendered view: ${view ?? '(unknown)'}`,
  ].join('\n'));

  return 0;
}

export async function runMigrateCommand(
  args: string[],
  dependencies: ForgeMigrateDependencies = defaultMigrateDependencies,
): Promise<number> {
  if (args.length > 0) {
    console.error(`Unexpected arguments: ${args.join(', ')}\n\n${renderCommandHelp('migrate')}`);
    return 1;
  }

  const projectRoot = dependencies.cwd();
  const schemaPath = path.join(projectRoot, 'db/schema.prisma');
  const packageJsonPath = path.join(projectRoot, 'package.json');

  try {
    await dependencies.access(schemaPath);
  } catch {
    console.error([
      'Failed to migrate: Prisma schema file is missing.',
      `Path: ${schemaPath}`,
      'Expected convention: db/schema.prisma exists in a Forge app.',
      'Try: run forge new to create a new app skeleton, or restore db/schema.prisma.',
    ].join('\n'));
    return 1;
  }

  try {
    await dependencies.access(packageJsonPath);
  } catch {
    console.error([
      'Failed to migrate: app package.json is missing.',
      `Path: ${packageJsonPath}`,
      'Expected convention: package.json exists at the project root.',
      'Try: run this command from your Forge app root directory.',
    ].join('\n'));
    return 1;
  }

  try {
    const packageJson = JSON.parse(await dependencies.readFile(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    if (!packageJson.scripts || typeof packageJson.scripts['db:migrate'] !== 'string') {
      throw new Error([
        'Missing db:migrate script in package.json.',
        `Path: ${packageJsonPath}`,
        "Expected convention: package.json scripts includes \"db:migrate\".",
        'Try: add "db:migrate": "prisma db push --schema db/schema.prisma" to scripts.',
      ].join('\n'));
    }

    await dependencies.runCommand('npm', ['run', 'db:migrate'], { cwd: projectRoot });

    console.log(renderSuccessMessage('Migration complete', [
      `Schema: ${schemaPath}`,
      `Database: ${path.join(projectRoot, 'db/dev.db')}`,
      'Workflow: npm run db:migrate',
    ]));

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to migrate: ${message}`);
    return 1;
  }
}

type ResolvedModelInfo = {
  modelFilePath: string;
  resourceName: string;
  controller?: string;
  controllerFilePath?: string;
  viewsPath?: string;
  routeNames: string[];
};

function resolveModelInfo(modelName: string, manifest: ForgeManifest): ResolvedModelInfo | null {
  const byModel = manifest.resources.find((resource) => resource.model === modelName);

  if (byModel && byModel.modelFilePath) {
    return {
      modelFilePath: byModel.modelFilePath,
      resourceName: byModel.name,
      controller: byModel.controller,
      controllerFilePath: byModel.controllerFilePath,
      viewsPath: byModel.viewsPath,
      routeNames: [...byModel.routeNames].sort((left, right) => left.localeCompare(right)),
    };
  }

  const fallbackModelFilePath = manifest.modelFilePaths.find((modelPath) =>
    modelPath.endsWith(`/${toModelBasename(modelName)}.model.ts`) || modelPath === `app/models/${toModelBasename(modelName)}.model.ts`
  );

  if (!manifest.models.includes(modelName) || !fallbackModelFilePath) {
    return null;
  }

  return {
    modelFilePath: fallbackModelFilePath,
    resourceName: pluralize(toModelBasename(modelName)),
    routeNames: [],
  };
}

function formatExplainLines(lines: string[]): string[] {
  return lines.length > 0 ? lines : ['- (none)'];
}

function resolveRoute(input: string, routes: ForgeManifest['routes']): ForgeManifest['routes'][number] | undefined {
  if (!input.startsWith('/')) {
    return routes.find((route) => route.name === input);
  }

  const requestSegments = splitPath(input);

  return routes.find((route) => {
    const routeSegments = splitPath(route.path);

    if (routeSegments.length !== requestSegments.length) {
      return false;
    }

    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index];
      const requestSegment = requestSegments[index];

      if (routeSegment.startsWith(':')) {
        continue;
      }

      if (routeSegment !== requestSegment) {
        return false;
      }
    }

    return true;
  });
}

function splitPath(pathValue: string): string[] {
  return pathValue.split('/').filter((segment) => segment.length > 0);
}

function formatControllerAction(route: ForgeManifest['routes'][number]): string {
  if (route.controller && route.action) {
    return `${route.controller}#${route.action}`;
  }

  if (route.controller) {
    return route.controller;
  }

  return '(none)';
}

function resolveControllerFilePath(
  route: ForgeManifest['routes'][number],
  manifest: ForgeManifest,
): string | undefined {
  if (!route.controller) {
    return undefined;
  }

  const byResource = manifest.resources.find((resource) =>
    resource.controller === route.controller && resource.routeNames.includes(route.name)
  );

  if (byResource?.controllerFilePath) {
    return byResource.controllerFilePath;
  }

  const basename = `${toControllerBasename(route.controller)}.controller.ts`;

  return manifest.controllerFilePaths.find((controllerPath) =>
    controllerPath.endsWith(`/${basename}`) || controllerPath === `app/controllers/${basename}`
  );
}

function resolveRenderedView(route: ForgeManifest['routes'][number], manifest: ForgeManifest): string | undefined {
  if (route.view) {
    return normalizeViewName(route.view);
  }

  const conventionalView = resolveConventionalView(route);

  if (!conventionalView) {
    return undefined;
  }

  if (manifest.views.includes(conventionalView)) {
    return conventionalView;
  }

  const conventionalPath = `app/views/${conventionalView}.html`;

  if (manifest.viewPaths.includes(conventionalPath)) {
    return conventionalView;
  }

  return undefined;
}

function resolveConventionalView(route: ForgeManifest['routes'][number]): string | undefined {
  if (!route.action || !['index', 'show', 'new', 'edit'].includes(route.action)) {
    return undefined;
  }

  const routeNameSegments = route.name.split('.');

  if (routeNameSegments.length !== 2) {
    return undefined;
  }

  const [resourceName, actionName] = routeNameSegments;

  if (actionName !== route.action) {
    return undefined;
  }

  return `${resourceName}/${actionName}`;
}

function normalizeViewName(view: string): string {
  return view.replace(/\\/g, '/').replace(/\.html$/, '');
}

function toModelBasename(modelName: string): string {
  return modelName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function toControllerBasename(controllerName: string): string {
  return controllerName
    .replace(/Controller$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function pluralize(value: string): string {
  if (value.endsWith('s')) {
    return `${value}es`;
  }

  if (value.endsWith('y')) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

function renderSuccessMessage(summary: string, lines: string[]): string {
  return [`✓ ${summary}`, ...lines].join('\n');
}

const exitCode = await run();

process.exitCode = exitCode;
