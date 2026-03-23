#!/usr/bin/env node

declare const process: {
  argv: string[];
  exitCode?: number;
};

type CommandHelpName = Parameters<typeof import('./commands.js').renderCommandHelp>[0];

import { parseCommand, renderCommandHelp } from './commands.js';

export function run(argv: string[] = process.argv.slice(2)): number {
  const result = parseCommand(argv);

  if (result.kind === 'help') {
    console.log(result.text);
    return 0;
  }

  if (result.kind === 'error') {
    console.error(result.text);
    return 1;
  }

  console.log(renderStubMessage(result.command.name, result.command.args));
  return 0;
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

process.exitCode = run();
