import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ForgeApp, loadRoutesConfig, registerRoutesFromConfig, validateResourceInput } from '../dist/index.js';

test('validateResourceInput applies required rules and defaults using model metadata', () => {
  const result = validateResourceInput(
    {
      metadata: {
        kind: 'model',
        name: 'Post',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'body', type: 'text', required: false, default: 'Draft body' },
          { name: 'published', type: 'boolean', required: false, default: false },
        ],
      },
    },
    { title: 'Hello Forge' },
  );

  assert.deepEqual(result, {
    valid: true,
    values: {
      title: 'Hello Forge',
      body: 'Draft body',
      published: false,
    },
    errors: {},
  });
});

test('scaffold-style create and update failures return useful HTML with submitted values and field errors', async () => {
  const rootDir = await createValidationApp();
  const app = new ForgeApp({ rootDir });
  const routes = await loadRoutesConfig(rootDir);
  const Post = {
    metadata: {
      kind: 'model',
      name: 'Post',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'body', type: 'text', required: false, default: 'Draft body' },
      ],
    },
  };

  class PostsController {
    async new({ response }) {
      return response.render('posts/new', this.buildFormData({ heading: 'New Post', formAction: '/posts', submitLabel: 'Create Post' }));
    }

    async create({ request, response }) {
      const validation = validateResourceInput(Post, request.body);
      if (!validation.valid) {
        return response.render('posts/new', this.buildFormData({ heading: 'New Post', formAction: '/posts', submitLabel: 'Create Post' }, validation), { status: 422 });
      }
      return response.redirect('/posts');
    }

    async edit({ request, response }) {
      return response.render('posts/edit', this.buildFormData({ heading: 'Edit Post', id: request.params.id ?? '', formAction: `/posts/${request.params.id ?? ''}/update`, submitLabel: 'Update Post' }));
    }

    async update({ request, response }) {
      const id = request.params.id ?? '';
      const validation = validateResourceInput(Post, request.body);
      if (!validation.valid) {
        return response.render('posts/edit', this.buildFormData({ heading: 'Edit Post', id, formAction: `/posts/${id}/update`, submitLabel: 'Update Post' }, validation), { status: 422 });
      }
      return response.redirect(`/posts/${id}`);
    }

    buildFormData(baseData, validation) {
      const values = validation?.values ?? {};
      const errors = validation?.errors ?? {};
      return {
        ...baseData,
        errorsHeading: validation ? 'Please correct the errors below.' : '',
        errorsSummary: validation ? ['<ul>', ...Object.values(errors).flat().map((message) => `  <li>${message}</li>`), '</ul>'].join('\n') : '',
        title: String(values.title ?? ''),
        titleError: errors.title?.[0] ?? '',
        body: String(values.body ?? 'Draft body'),
        bodyError: errors.body?.[0] ?? '',
      };
    }
  }

  await registerRoutesFromConfig(app, routes, { rootDir, controllers: { PostsController } });

  const server = await app.boot({ port: 3111 });

  try {
    const newResponse = await fetch(`http://${server.host}:${server.port}/posts/new`);
    const newHtml = await newResponse.text();
    assert.equal(newResponse.status, 200);
    assert.match(newHtml, /Draft body/);

    const createResponse = await fetch(`http://${server.host}:${server.port}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: '', body: 'Typed body' }),
    });
    const createHtml = await createResponse.text();

    assert.equal(createResponse.status, 422);
    assert.match(createHtml, /Please correct the errors below\./);
    assert.match(createHtml, /Title is required\./);
    assert.match(createHtml, /<textarea name="body">Typed body<\/textarea>/);

    const updateResponse = await fetch(`http://${server.host}:${server.port}/posts/42/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: '', body: 'Updated body' }),
    });
    const updateHtml = await updateResponse.text();

    assert.equal(updateResponse.status, 422);
    assert.match(updateHtml, /Editing record 42/);
    assert.match(updateHtml, /Title is required\./);
    assert.match(updateHtml, /<textarea name="body">Updated body<\/textarea>/);
    assert.match(updateHtml, /action="\/posts\/42\/update"/);
  } finally {
    await server.close();
  }
});

async function createValidationApp() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'forge-validation-flow-'));

  await mkdir(path.join(rootDir, 'app/views/layouts'), { recursive: true });
  await mkdir(path.join(rootDir, 'app/views/posts'), { recursive: true });
  await mkdir(path.join(rootDir, 'config'), { recursive: true });

  await writeFile(path.join(rootDir, 'app/views/layouts/app.html'), '<body>{{content}}</body>\n', 'utf8');
  await writeFile(path.join(rootDir, 'app/views/posts/new.html'), '<main><h1>{{heading}}</h1>{{> _form}}</main>\n', 'utf8');
  await writeFile(path.join(rootDir, 'app/views/posts/edit.html'), '<main><h1>{{heading}}</h1><p>Editing record {{id}}</p>{{> _form}}</main>\n', 'utf8');
  await writeFile(
    path.join(rootDir, 'app/views/posts/_form.html'),
    [
      '<form method="POST" action="{{formAction}}">',
      '  <div>{{errorsHeading}}</div>',
      '  <div>{{errorsSummary}}</div>',
      '  <div>{{titleError}}</div>',
      '  <label>',
      '    Post title',
      '    <input type="text" name="title" value="{{title}}">',
      '  </label>',
      '  <div>{{bodyError}}</div>',
      '  <label>',
      '    Post body',
      '    <textarea name="body">{{body}}</textarea>',
      '  </label>',
      '  <button type="submit">{{submitLabel}}</button>',
      '</form>',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(rootDir, 'config/routes.js'),
    [
      'export const routes = [',
      "  { name: 'posts.new', method: 'GET', path: '/posts/new', controller: 'PostsController', action: 'new' },",
      "  { name: 'posts.create', method: 'POST', path: '/posts', controller: 'PostsController', action: 'create' },",
      "  { name: 'posts.edit', method: 'GET', path: '/posts/:id/edit', controller: 'PostsController', action: 'edit' },",
      "  { name: 'posts.update', method: 'POST', path: '/posts/:id/update', controller: 'PostsController', action: 'update' },",
      '];',
      '',
    ].join('\n'),
    'utf8',
  );

  return rootDir;
}
