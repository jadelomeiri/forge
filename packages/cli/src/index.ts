#!/usr/bin/env node

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createForgeApp } from '@forge/create-forge-app';
import { generateModel, generateScaffold, parseModelMetadata } from '@forge/generators';
import { readManifest, type ForgeManifest } from '@forge/manifest';
import { parseCommand, renderCommandHelp } from './commands.js';

type CommandHelpName = Parameters<typeof renderCommandHelp>[0];

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

  if (result.command.name === 'migrate') {
    return runMigrateCommand(result.command.args);
  }

  if (result.command.name === 'explain model') {
    return runExplainModelCommand(result.command.args);
  }

  console.log(renderStubMessage(result.command.name, result.command.args));
  return 0;
}

async function runGenerateModelCommand(args: string[]): Promise<number> {
  const [modelName, ...fieldArgs] = args;

  if (!modelName) {
    console.error('Missing model name.\n\n' + renderCommandHelp('generate model'));
    return 1;
  }

  try {
    const result = await generateModel({
      projectRoot: process.cwd(),
      modelName,
      fieldArgs,
    });

    console.log([
      `Generated model: ${result.modelName}`,
      `Model file: ${result.modelFilePath}`,
      `Schema source: ${result.schemaPath}`,
      `Manifest: ${result.manifestPath}`,
      '',
      'Fields:',
      ...(result.fields.length > 0
        ? result.fields.map((field) => `- ${field.name}:${field.type}`)
        : ['- (none)']),
    ].join('\n'));

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
    console.error('Missing scaffold name.\n\n' + renderCommandHelp('generate scaffold'));
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

    console.log([
      `Generated scaffold: ${result.resourceName}`,
      `Controller: ${result.controllerFilePath}`,
      `Routes: ${result.routesPath}`,
      `Manifest: ${result.manifestPath}`,
      '',
      'Tests:',
      ...result.testFilePaths.map((testFilePath) => `- ${testFilePath}`),
      '',
      'Views:',
      ...result.viewPaths.map((viewPath) => `- ${viewPath}`),
    ].join('\n'));

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
    console.error('Missing app name.\n\n' + renderCommandHelp('new'));
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

    console.log([
      `Created Forge app: ${result.appName}`,
      `Location: ${result.appRoot}`,
      '',
      'Created files:',
      ...result.files.map((file: string) => `- ${file}`),
    ].join('\n'));

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

export async function runExplainModelCommand(
  args: string[],
  dependencies: ForgeExplainModelDependencies = defaultExplainModelDependencies,
): Promise<number> {
  const [modelName, ...extraArgs] = args;

  if (!modelName) {
    console.error('Missing model name.\n\n' + renderCommandHelp('explain model'));
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
    console.error(`Failed to explain model: expected Forge manifest at ${manifestPath}`);
    return 1;
  }

  const modelInfo = resolveModelInfo(modelName, manifest);

  if (!modelInfo) {
    console.error(`Failed to explain model: model ${modelName} was not found in ${manifestPath}`);
    return 1;
  }

  const modelFilePath = path.join(projectRoot, modelInfo.modelFilePath);

  try {
    await dependencies.access(modelFilePath);
  } catch {
    console.error(`Failed to explain model: expected model file at ${modelFilePath}`);
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
    console.error(`Failed to migrate: expected Prisma schema at ${schemaPath}`);
    return 1;
  }

  try {
    await dependencies.access(packageJsonPath);
  } catch {
    console.error(`Failed to migrate: expected app package.json at ${packageJsonPath}`);
    return 1;
  }

  try {
    const packageJson = JSON.parse(await dependencies.readFile(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    if (!packageJson.scripts || typeof packageJson.scripts['db:migrate'] !== 'string') {
      throw new Error('Expected package.json to define a db:migrate script.');
    }

    await dependencies.runCommand('npm', ['run', 'db:migrate'], { cwd: projectRoot });

    console.log([
      'Migration complete.',
      `Schema: ${schemaPath}`,
      `Database: ${path.join(projectRoot, 'db/dev.db')}`,
      'Workflow: npm run db:migrate',
    ].join('\n'));

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

function toModelBasename(modelName: string): string {
  return modelName
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

function renderStubMessage(name: CommandHelpName, args: string[]): string {
  const formattedArgs = args.length > 0 ? args.join(', ') : '(none)';

  return [
    `Stub command: forge ${name}`,
    `Args: ${formattedArgs}`,
    '',
    renderCommandHelp(name),
    '',
    'This command is part of the Task 2 CLI skeleton and does not perform framework behavior yet.',
  ].join('\n');
}

const exitCode = await run();

process.exitCode = exitCode;
