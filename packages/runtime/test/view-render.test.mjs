import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ForgeApp, createViewRenderer, renderView } from '../dist/index.js';

const FIXTURE_ROOT = path.resolve('test/fixtures');

test('renderView applies the default layout and view data', async () => {
  const html = await renderView('posts/show', {
    rootDir: FIXTURE_ROOT,
    data: {
      pageTitle: 'Post details',
      heading: 'Hello Forge',
      message: 'Readable by default',
    },
  });

  assert.match(html, /<title>Post details<\/title>/);
  assert.match(html, /<h1>Hello Forge<\/h1>/);
  assert.match(html, /<p>Readable by default<\/p>/);
  assert.match(html, /<body>[\s\S]*<main>/);
});

test('partials render from the current view folder and use shared data', async () => {
  const html = await renderView('posts/new', {
    rootDir: FIXTURE_ROOT,
    layout: false,
    data: {
      formTitle: 'Create post',
      submitLabel: 'Save Post',
    },
  });

  assert.match(html, /<h1>Create post<\/h1>/);
  assert.match(html, /<button type="submit">Save Post<\/button>/);
});

test('ForgeApp booted controllers receive response.render', async () => {
  const fixtureRoot = await createTempApp();
  const app = new ForgeApp({ rootDir: fixtureRoot });

  app.get('/', async ({ response }) => response.render('welcome/index', { message: 'Hi there' }));

  const server = await app.boot({ port: 3107 });
  try {
    const result = await fetch(`http://${server.host}:${server.port}/`);
    const html = await result.text();

    assert.equal(result.status, 200);
    assert.match(html, /<body>[\s\S]*Hi there/);
  } finally {
    await server.close();
  }
});

async function createTempApp() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-'));
  await mkdir(path.join(root, 'app/views/layouts'), { recursive: true });
  await mkdir(path.join(root, 'app/views/welcome'), { recursive: true });
  await writeFile(path.join(root, 'app/views/layouts/app.html'), '<body>{{content}}</body>\n', 'utf8');
  await writeFile(path.join(root, 'app/views/welcome/index.html'), '<main>{{message}}</main>\n', 'utf8');
  return root;
}
