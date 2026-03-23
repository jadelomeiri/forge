export type ForgeCommandName =
  | 'new'
  | 'dev'
  | 'migrate'
  | 'generate model'
  | 'generate scaffold'
  | 'explain model'
  | 'explain route';

export type ForgeCommand = {
  name: ForgeCommandName;
  args: string[];
  description: string;
  usage: string;
};

const COMMAND_SPECS: Record<ForgeCommandName, Omit<ForgeCommand, 'args'>> = {
  new: {
    name: 'new',
    description: 'Create a new Forge application.',
    usage: 'forge new <name>',
  },
  dev: {
    name: 'dev',
    description: 'Start the Forge development server (stub).',
    usage: 'forge dev',
  },
  migrate: {
    name: 'migrate',
    description: 'Run database migrations (stub).',
    usage: 'forge migrate',
  },
  'generate model': {
    name: 'generate model',
    description: 'Generate a model file (stub).',
    usage: 'forge generate model <name> [fields...]',
  },
  'generate scaffold': {
    name: 'generate scaffold',
    description: 'Generate CRUD scaffolding (stub).',
    usage: 'forge generate scaffold <name>',
  },
  'explain model': {
    name: 'explain model',
    description: 'Explain a Forge model (stub).',
    usage: 'forge explain model <name>',
  },
  'explain route': {
    name: 'explain route',
    description: 'Explain how a route resolves (stub).',
    usage: 'forge explain route <path>',
  },
};

export type ParseResult =
  | { kind: 'command'; command: ForgeCommand }
  | { kind: 'help'; text: string }
  | { kind: 'error'; text: string };

export function parseCommand(argv: string[]): ParseResult {
  if (argv.length === 0 || isHelpFlag(argv[0])) {
    return { kind: 'help', text: renderMainHelp() };
  }

  const [first, second, third, ...rest] = argv;

  if (first === 'new') {
    if (isHelpFlag(second)) {
      return { kind: 'help', text: renderCommandHelp('new') };
    }

    return commandResult('new', [second, third, ...rest].filter(isDefined));
  }

  if (first === 'dev') {
    return commandResult('dev', [second, third, ...rest].filter(isDefined));
  }

  if (first === 'migrate') {
    return commandResult('migrate', [second, third, ...rest].filter(isDefined));
  }

  if (first === 'generate') {
    if (!second || isHelpFlag(second)) {
      return { kind: 'help', text: renderGenerateHelp() };
    }

    if (second === 'model') {
      if (isHelpFlag(third)) {
        return { kind: 'help', text: renderCommandHelp('generate model') };
      }

      return commandResult('generate model', [third, ...rest].filter(isDefined));
    }

    if (second === 'scaffold') {
      if (isHelpFlag(third)) {
        return { kind: 'help', text: renderCommandHelp('generate scaffold') };
      }

      return commandResult('generate scaffold', [third, ...rest].filter(isDefined));
    }

    return {
      kind: 'error',
      text: `Unknown generate target: ${second}\n\n${renderGenerateHelp()}`,
    };
  }

  if (first === 'explain') {
    if (!second || isHelpFlag(second)) {
      return { kind: 'help', text: renderExplainHelp() };
    }

    if (second === 'model') {
      if (isHelpFlag(third)) {
        return { kind: 'help', text: renderCommandHelp('explain model') };
      }

      return commandResult('explain model', [third, ...rest].filter(isDefined));
    }

    if (second === 'route') {
      if (isHelpFlag(third)) {
        return { kind: 'help', text: renderCommandHelp('explain route') };
      }

      return commandResult('explain route', [third, ...rest].filter(isDefined));
    }

    return {
      kind: 'error',
      text: `Unknown explain target: ${second}\n\n${renderExplainHelp()}`,
    };
  }

  return {
    kind: 'error',
    text: `Unknown command: ${first}\n\n${renderMainHelp()}`,
  };
}

export function renderMainHelp(): string {
  return [
    'Forge CLI',
    '',
    'Usage:',
    '  forge <command> [options]',
    '',
    'Commands:',
    formatCommandLine('new', COMMAND_SPECS.new.description),
    formatCommandLine('dev', COMMAND_SPECS.dev.description),
    formatCommandLine('migrate', COMMAND_SPECS.migrate.description),
    formatCommandLine('generate model', COMMAND_SPECS['generate model'].description),
    formatCommandLine('generate scaffold', COMMAND_SPECS['generate scaffold'].description),
    formatCommandLine('explain model', COMMAND_SPECS['explain model'].description),
    formatCommandLine('explain route', COMMAND_SPECS['explain route'].description),
    '',
    'Run forge <command> --help for command-specific usage.',
  ].join('\n');
}

export function renderGenerateHelp(): string {
  return [
    'Forge CLI',
    '',
    'Usage:',
    '  forge generate <target> [args]',
    '',
    'Targets:',
    formatCommandLine('model', 'Generate a model file (stub).'),
    formatCommandLine('scaffold', 'Generate CRUD scaffolding (stub).'),
  ].join('\n');
}

export function renderExplainHelp(): string {
  return [
    'Forge CLI',
    '',
    'Usage:',
    '  forge explain <subject> [args]',
    '',
    'Subjects:',
    formatCommandLine('model', 'Explain a Forge model (stub).'),
    formatCommandLine('route', 'Explain how a route resolves (stub).'),
  ].join('\n');
}

export function renderCommandHelp(name: ForgeCommandName): string {
  const command = COMMAND_SPECS[name];

  return [
    'Forge CLI',
    '',
    `Command: ${command.name}`,
    '',
    command.description,
    '',
    'Usage:',
    `  ${command.usage}`,
  ].join('\n');
}

function commandResult(name: ForgeCommandName, args: string[]): ParseResult {
  return {
    kind: 'command',
    command: {
      ...COMMAND_SPECS[name],
      args,
    },
  };
}

function formatCommandLine(name: string, description: string): string {
  return `  ${name.padEnd(18)}${description}`;
}

function isHelpFlag(value: string | undefined): value is '--help' | '-h' {
  return value === '--help' || value === '-h';
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
