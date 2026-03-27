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


test('createForgeApp initializes a manifest with framework, file paths, and conventions metadata', async () => {
  const destinationRoot = await mkdtemp(path.join(tmpdir(), 'forge-new-manifest-'));
  const result = await createForgeApp({
    appName: 'manifest-app',
    destinationRoot,
  });

  const manifest = JSON.parse(await readFile(path.join(result.appRoot, '.forge/manifest.json'), 'utf8'));

  assert.equal(JSON.stringify(manifest.app), JSON.stringify({ name: 'manifest-app' }));
  assert.equal(JSON.stringify(manifest.framework), JSON.stringify({ name: 'forge', version: '0.0.0' }));
  assert.equal(JSON.stringify(manifest.resources), JSON.stringify([]));
  assert.equal(JSON.stringify(manifest.modelFilePaths), JSON.stringify([]));
  assert.equal(JSON.stringify(manifest.controllerFilePaths), JSON.stringify([]));
  assert.equal(JSON.stringify(manifest.viewPaths), JSON.stringify(['app/views/home/index.html', 'app/views/layouts/app.html', 'app/views/layouts/auth.html']));
  assert.equal(JSON.stringify(manifest.routes), JSON.stringify([{ name: 'home.index', method: 'GET', path: '/', view: 'home/index' }]));
  assert.equal(typeof manifest.conventions.models, 'object');
  assert.equal(typeof manifest.conventions.controllers, 'object');
  assert.equal(typeof manifest.conventions.views, 'object');
});
