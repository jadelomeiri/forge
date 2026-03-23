import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createForgeApp } from './index.js';

test('createForgeApp writes the generated db:migrate workflow into package.json', async () => {
  const destinationRoot = await mkdtemp(path.join(tmpdir(), 'forge-new-app-'));
  const result = await createForgeApp({
    appName: 'demo-app',
    destinationRoot,
  });

  const packageJson = JSON.parse(await readFile(path.join(result.appRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['db:migrate'], 'prisma db push --schema db/schema.prisma');
  assert.equal(packageJson.dependencies['@prisma/client'], '^6.15.0');
  assert.equal(packageJson.devDependencies.prisma, '^6.15.0');
});
