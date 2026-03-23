import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { runMigrateCommand } from './index.js';

test('runMigrateCommand runs the generated app db:migrate workflow', async () => {
  const commandCalls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const projectRoot = '/tmp/forge-demo';

  const exitCode = await runMigrateCommand([], {
    cwd: () => projectRoot,
    access: async () => undefined,
    readFile: async (filePath) => {
      assert.equal(filePath, path.join(projectRoot, 'package.json'));

      return JSON.stringify({
        scripts: {
          'db:migrate': 'prisma db push --schema db/schema.prisma',
        },
      });
    },
    runCommand: async (command, args, options) => {
      commandCalls.push({ command, args, cwd: options.cwd });
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commandCalls, [
    {
      command: 'npm',
      args: ['run', 'db:migrate'],
      cwd: projectRoot,
    },
  ]);
});

test('runMigrateCommand fails when the generated app db:migrate script is missing', async () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (value?: unknown) => {
    errors.push(String(value));
  };

  try {
    const exitCode = await runMigrateCommand([], {
      cwd: () => '/tmp/forge-demo',
      access: async () => undefined,
      readFile: async () => JSON.stringify({ scripts: {} }),
      runCommand: async () => undefined,
    });

    assert.equal(exitCode, 1);
    assert.match(errors.join('\n'), /Expected package\.json to define a db:migrate script/);
  } finally {
    console.error = originalError;
  }
});

test('runMigrateCommand fails when db/schema.prisma is missing', async () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (value?: unknown) => {
    errors.push(String(value));
  };

  try {
    const exitCode = await runMigrateCommand([], {
      cwd: () => '/tmp/forge-demo',
      access: async (filePath) => {
        if (filePath.endsWith('db/schema.prisma')) {
          throw new Error('missing');
        }
      },
      readFile: async () => JSON.stringify({}),
      runCommand: async () => undefined,
    });

    assert.equal(exitCode, 1);
    assert.match(errors.join('\n'), /expected Prisma schema/);
  } finally {
    console.error = originalError;
  }
});
