import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  generateModel,
  generateScaffold,
  parseModelFields,
  parseModelMetadata,
  renderModelFile,
  renderScaffoldControllerFile,
  renderScaffoldFormPartial,
  renderScaffoldEditView,
  renderScaffoldIndexView,
  renderScaffoldNewView,
  renderScaffoldShowView,
} from './index.js';

test('parseModelFields supports primitive name:type pairs', () => {
  assert.deepEqual(parseModelFields(['title:string', 'body:text', 'published:boolean']), [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'text' },
    { name: 'published', type: 'boolean' },
  ]);
});

test('parseModelMetadata reads required fields and defaults from model source', () => {
  assert.deepEqual(
    parseModelMetadata(
      [
        "import { defineModel, field } from '@forge/core';",
        '',
        "export const Post = defineModel('Post', {",
        "  title: field.string({ required: true }),",
        "  body: field.text({ default: 'Draft body' }),",
        '  published: field.boolean({ default: false }),',
        '});',
        '',
      ].join('\n'),
      'Post',
    ),
    {
      kind: 'model',
      name: 'Post',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'body', type: 'text', required: false, default: 'Draft body' },
        { name: 'published', type: 'boolean', required: false, default: false },
      ],
    },
  );
});

test('renderModelFile uses the Task 4 DSL in a readable format', () => {
  assert.equal(
    renderModelFile('Post', [
      { name: 'title', type: 'string' },
      { name: 'body', type: 'text' },
    ]),
    [
      "import { defineModel, field } from '@forge/core';",
      '',
      "export const Post = defineModel('Post', {",
      '  title: field.string(),',
      '  body: field.text(),',
      '});',
      '',
    ].join('\n'),
  );
});

test('generateModel writes the model file, appends schema, and updates the manifest', async () => {
  const projectRoot = await createProject('forge-model-generator-');

  const result = await generateModel({
    projectRoot,
    modelName: 'Post',
    fieldArgs: ['title:string', 'body:text', 'published:boolean'],
  });

  assert.equal(result.modelName, 'Post');

  const modelFile = await readFile(path.join(projectRoot, 'app/models/post.model.ts'), 'utf8');
  assert.equal(
    modelFile,
    [
      "import { defineModel, field } from '@forge/core';",
      '',
      "export const Post = defineModel('Post', {",
      '  title: field.string(),',
      '  body: field.text(),',
      '  published: field.boolean(),',
      '});',
      '',
    ].join('\n'),
  );

  const schema = await readFile(path.join(projectRoot, 'db/schema.prisma'), 'utf8');
  assert.match(schema, /model Post \{/);
  assert.match(schema, /title String/);
  assert.match(schema, /body String/);
  assert.match(schema, /published Boolean/);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.forge/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.models, ['Post']);
});

test('generateScaffold writes validation-aware controller, views, routes metadata, tests, and manifest entries', async () => {
  const projectRoot = await createProject('forge-scaffold-generator-');
  const resource = buildPostResource();

  await writeFile(
    path.join(projectRoot, 'app/models/post.model.ts'),
    [
      "import { defineModel, field } from '@forge/core';",
      '',
      "export const Post = defineModel('Post', {",
      '  title: field.string({ required: true }),',
      "  body: field.text({ default: 'Draft body' }),",
      '  published: field.boolean({ default: false }),',
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  const result = await generateScaffold({
    projectRoot,
    name: 'Post',
  });

  assert.equal(result.resourceName, 'Post');
  assert.equal(result.controllerClassName, 'PostsController');

  const controllerFile = await readFile(path.join(projectRoot, 'app/controllers/posts.controller.ts'), 'utf8');
  assert.equal(controllerFile, renderScaffoldControllerFile(resource));

  assert.equal(await readFile(path.join(projectRoot, 'app/views/posts/index.html'), 'utf8'), renderScaffoldIndexView(resource));
  assert.equal(await readFile(path.join(projectRoot, 'app/views/posts/show.html'), 'utf8'), renderScaffoldShowView());
  assert.equal(await readFile(path.join(projectRoot, 'app/views/posts/new.html'), 'utf8'), renderScaffoldNewView());
  assert.equal(await readFile(path.join(projectRoot, 'app/views/posts/edit.html'), 'utf8'), renderScaffoldEditView());
  assert.equal(await readFile(path.join(projectRoot, 'app/views/posts/_form.html'), 'utf8'), renderScaffoldFormPartial(resource));

  const routesConfig = await readFile(path.join(projectRoot, 'config/routes.ts'), 'utf8');
  assert.match(routesConfig, /name: 'posts.index'/);
  assert.match(routesConfig, /name: 'posts.new'/);
  assert.match(routesConfig, /name: 'posts.create'/);
  assert.match(routesConfig, /name: 'posts.show'/);
  assert.match(routesConfig, /name: 'posts.edit'/);
  assert.match(routesConfig, /name: 'posts.update'/);
  assert.match(routesConfig, /name: 'posts.delete'/);
  assert.equal(routesConfig.includes(',,'), false);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.forge/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.controllers, ['PostsController']);
  assert.deepEqual(manifest.views, ['home/index', 'layouts/app', 'layouts/auth', 'posts/_form', 'posts/edit', 'posts/index', 'posts/new', 'posts/show']);
  assert.deepEqual(
    manifest.routes.map((route: { name: string }) => route.name),
    ['home.index', 'posts.index', 'posts.new', 'posts.create', 'posts.show', 'posts.edit', 'posts.update', 'posts.delete'],
  );

  const generatedTest = await readFile(path.join(projectRoot, 'tests/integration/posts-controller.test.ts'), 'utf8');
  assert.match(generatedTest, /PostsController exposes the standard scaffold actions/);
  assert.match(generatedTest, /posts\.scaffold routes are registered|posts scaffold routes are registered/);
});

function buildPostResource() {
  return {
    modelName: 'Post',
    modelFileBasename: 'post',
    fields: [
      { name: 'title', type: 'string' as const, required: true },
      { name: 'body', type: 'text' as const, required: false, default: 'Draft body' },
      { name: 'published', type: 'boolean' as const, required: false, default: false },
    ],
    collectionPath: 'posts',
    controllerClassName: 'PostsController',
    controllerFileName: 'posts',
    routeBaseName: 'posts',
    basePath: '/posts',
    singularTitle: 'Post',
    collectionTitle: 'Posts',
    collectionLabel: 'posts',
    viewPrefix: 'posts',
    routes: [
      { name: 'posts.index', method: 'GET', path: '/posts', controller: 'PostsController', action: 'index' },
      { name: 'posts.new', method: 'GET', path: '/posts/new', controller: 'PostsController', action: 'new' },
      { name: 'posts.create', method: 'POST', path: '/posts', controller: 'PostsController', action: 'create' },
      { name: 'posts.show', method: 'GET', path: '/posts/:id', controller: 'PostsController', action: 'show' },
      { name: 'posts.edit', method: 'GET', path: '/posts/:id/edit', controller: 'PostsController', action: 'edit' },
      { name: 'posts.update', method: 'POST', path: '/posts/:id/update', controller: 'PostsController', action: 'update' },
      { name: 'posts.delete', method: 'POST', path: '/posts/:id/delete', controller: 'PostsController', action: 'delete' },
    ],
    viewManifestEntries: ['posts/_form', 'posts/edit', 'posts/index', 'posts/new', 'posts/show'],
  };
}

async function createProject(prefix: string): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));

  await mkdir(path.join(projectRoot, 'app/models'), { recursive: true });
  await mkdir(path.join(projectRoot, 'app/controllers'), { recursive: true });
  await mkdir(path.join(projectRoot, 'app/views/layouts'), { recursive: true });
  await mkdir(path.join(projectRoot, 'config'), { recursive: true });
  await mkdir(path.join(projectRoot, 'db'), { recursive: true });
  await mkdir(path.join(projectRoot, '.forge'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests/integration'), { recursive: true });

  await writeFile(path.join(projectRoot, 'db/schema.prisma'), [
    'generator client {',
    "  provider = 'prisma-client-js'",
    '}',
    '',
    'datasource db {',
    "  provider = 'sqlite'",
    "  url      = 'file:./dev.db'",
    '}',
    '',
  ].join('\n'));

  await writeFile(path.join(projectRoot, 'config/routes.ts'), [
    'export const routes = [',
    '  {',
    "    name: 'home.index',",
    "    method: 'GET',",
    "    path: '/',",
    "    view: 'home/index',",
    '  },',
    '] as const;',
    '',
  ].join('\n'));

  await writeFile(
    path.join(projectRoot, '.forge/manifest.json'),
    JSON.stringify(
      {
        app: { name: 'demo-app' },
        models: [],
        controllers: [],
        routes: [
          {
            name: 'home.index',
            method: 'GET',
            path: '/',
            view: 'home/index',
          },
        ],
        views: ['layouts/app', 'layouts/auth', 'home/index'],
        conventions: {},
      },
      null,
      2,
    ) + '\n',
  );

  return projectRoot;
}
