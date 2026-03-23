import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ForgeApp, loadRoutesConfig, registerRoutesFromConfig } from '../dist/index.js';

test('registerRoutesFromConfig wires scaffold resource routes with controller/action resolution', async () => {
  const rootDir = await createResourceApp();
  const app = new ForgeApp({ rootDir });
  const routes = await loadRoutesConfig(rootDir);

  await registerRoutesFromConfig(app, routes, { rootDir });

  assert.deepEqual(
    app.routesList().map((route) => ({ name: route.name, method: route.method, path: route.path })),
    [
      { name: 'posts.index', method: 'GET', path: '/posts' },
      { name: 'posts.new', method: 'GET', path: '/posts/new' },
      { name: 'posts.create', method: 'POST', path: '/posts' },
      { name: 'posts.show', method: 'GET', path: '/posts/:id' },
      { name: 'posts.edit', method: 'GET', path: '/posts/:id/edit' },
      { name: 'posts.update', method: 'POST', path: '/posts/:id/update' },
      { name: 'posts.delete', method: 'POST', path: '/posts/:id/delete' },
    ],
  );

  const server = await app.boot({ port: 3108 });

  try {
    const showResponse = await fetch(`http://${server.host}:${server.port}/posts/42`);
    const editResponse = await fetch(`http://${server.host}:${server.port}/posts/42/edit`);
    const updateResponse = await fetch(`http://${server.host}:${server.port}/posts/42/update`, {
      method: 'POST',
      redirect: 'manual',
    });
    const deleteResponse = await fetch(`http://${server.host}:${server.port}/posts/42/delete`, {
      method: 'POST',
      redirect: 'manual',
    });

    assert.equal(showResponse.status, 200);
    assert.match(await showResponse.text(), /show:42/);

    assert.equal(editResponse.status, 200);
    assert.match(await editResponse.text(), /edit:42/);

    assert.equal(updateResponse.status, 302);
    assert.equal(updateResponse.headers.get('location'), '/posts/42');

    assert.equal(deleteResponse.status, 302);
    assert.equal(deleteResponse.headers.get('location'), '/posts');
  } finally {
    await server.close();
  }
});

async function createResourceApp() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'forge-resource-routing-'));

  await mkdir(path.join(rootDir, 'app/controllers'), { recursive: true });
  await mkdir(path.join(rootDir, 'app/views/layouts'), { recursive: true });
  await mkdir(path.join(rootDir, 'config'), { recursive: true });

  await writeFile(path.join(rootDir, 'app/views/layouts/app.html'), '<body>{{content}}</body>\n', 'utf8');
  await writeFile(
    path.join(rootDir, 'app/controllers/posts.controller.js'),
    [
      'export class PostsController {',
      '  async index({ response }) {',
      "    return response.html('index');",
      '  }',
      '',
      '  async new({ response }) {',
      "    return response.html('new');",
      '  }',
      '',
      '  async create({ response }) {',
      "    return response.redirect('/posts');",
      '  }',
      '',
      '  async show({ request, response }) {',
      "    return response.html(`show:${request.params.id ?? ''}`);",
      '  }',
      '',
      '  async edit({ request, response }) {',
      "    return response.html(`edit:${request.params.id ?? ''}`);",
      '  }',
      '',
      '  async update({ request, response }) {',
      "    return response.redirect(`/posts/${request.params.id ?? ''}`);",
      '  }',
      '',
      '  async delete({ response }) {',
      "    return response.redirect('/posts');",
      '  }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(rootDir, 'config/routes.js'),
    [
      'export const routes = [',
      "  { name: 'posts.index', method: 'GET', path: '/posts', controller: 'PostsController', action: 'index' },",
      "  { name: 'posts.new', method: 'GET', path: '/posts/new', controller: 'PostsController', action: 'new' },",
      "  { name: 'posts.create', method: 'POST', path: '/posts', controller: 'PostsController', action: 'create' },",
      "  { name: 'posts.show', method: 'GET', path: '/posts/:id', controller: 'PostsController', action: 'show' },",
      "  { name: 'posts.edit', method: 'GET', path: '/posts/:id/edit', controller: 'PostsController', action: 'edit' },",
      "  { name: 'posts.update', method: 'POST', path: '/posts/:id/update', controller: 'PostsController', action: 'update' },",
      "  { name: 'posts.delete', method: 'POST', path: '/posts/:id/delete', controller: 'PostsController', action: 'delete' },",
      '];',
      '',
    ].join('\n'),
    'utf8',
  );

  return rootDir;
}
