#!/usr/bin/env node

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

import { createForgeApp } from '@forge/create-forge-app';
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

  console.log(renderStubMessage(result.command.name, result.command.args));
  return 0;
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
