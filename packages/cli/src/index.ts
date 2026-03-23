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
import { generateModel, generateScaffold } from '@forge/generators';
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
      `Test: ${result.testFilePath}`,
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
