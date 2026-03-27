import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  generateModel,
  generateScaffold,
  parseModelFields,
  parseModelMetadata,
  renderModelFile,
  renderScaffoldControllerFile,
  renderScaffoldE2ETestFile,
  renderScaffoldFormPartial,
  renderScaffoldEditView,
  renderScaffoldIndexView,
  renderScaffoldIntegrationTestFile,
  renderScaffoldModelTestFile,
  renderScaffoldNewView,
  renderScaffoldShowView,
} from './index.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(process.cwd(), '../..');

test('parseModelFields supports primitive name:type pairs', () => {
  assert.deepEqual(parseModelFields(['title:string', 'body:text', 'published:boolean']), [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'text' },
    { name: 'published', type: 'boolean' },
  ]);
});

test('parseModelFields reports convention and fix for invalid field definitions', () => {
  try {
    parseModelFields(['title']);
    assert.equal('expected parseModelFields to throw', 'threw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /Invalid field definition: "title"/);
    assert.match(message, /Expected convention: name:type/);
    assert.match(message, /Try: title:string/);
  }
});

test('parseModelMetadata reports expected convention when defineModel block is missing', () => {
  try {
    parseModelMetadata("export const Post = {};\n", 'Post');
    assert.equal('expected parseModelMetadata to throw', 'threw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /Could not find defineModel\('Post'/);
    assert.match(message, /Expected convention: export const ModelName = defineModel/);
  }
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
  assert.deepEqual(manifest.modelFilePaths, ['app/models/post.model.ts']);
  assert.deepEqual(manifest.resources, [{ name: 'posts', model: 'Post', modelFilePath: 'app/models/post.model.ts', routeNames: [] }]);
});

test('generateScaffold writes validation-aware controller, views, routes metadata, generated tests, and manifest entries', async () => {
  const projectRoot = await createProject('forge-scaffold-generator-');
  const resource = buildPostResource();

  await writePostModel(projectRoot);

  const result = await generateScaffold({
    projectRoot,
    name: 'Post',
  });

  assert.equal(result.resourceName, 'Post');
  assert.equal(result.controllerClassName, 'PostsController');
  assert.deepEqual(result.testFilePaths, [
    path.join(projectRoot, 'tests/unit/post.model.test.ts'),
    path.join(projectRoot, 'tests/integration/posts-controller.test.ts'),
    path.join(projectRoot, 'tests/e2e/posts-smoke.test.ts'),
  ]);

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
  assert.equal(routesConfig.includes(',,') , false);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.forge/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.controllers, ['PostsController']);
  assert.deepEqual(manifest.controllerFilePaths, ['app/controllers/posts.controller.ts']);
  assert.deepEqual(manifest.views, ['home/index', 'layouts/app', 'layouts/auth', 'posts/_form', 'posts/edit', 'posts/index', 'posts/new', 'posts/show']);
  assert.deepEqual(manifest.viewPaths, [
    'app/views/home/index.html',
    'app/views/layouts/app.html',
    'app/views/layouts/auth.html',
    'app/views/posts/_form.html',
    'app/views/posts/edit.html',
    'app/views/posts/index.html',
    'app/views/posts/new.html',
    'app/views/posts/show.html',
  ]);
  assert.deepEqual(
    manifest.routes.map((route: { name: string }) => route.name),
    ['home.index', 'posts.index', 'posts.new', 'posts.create', 'posts.show', 'posts.edit', 'posts.update', 'posts.delete'],
  );
  assert.deepEqual(manifest.resources, [{
    name: 'posts',
    model: 'Post',
    modelFilePath: 'app/models/post.model.ts',
    controller: 'PostsController',
    controllerFilePath: 'app/controllers/posts.controller.ts',
    viewsPath: 'app/views/posts',
    routeNames: ['posts.create', 'posts.delete', 'posts.edit', 'posts.index', 'posts.new', 'posts.show', 'posts.update'],
  }]);

  assert.equal(
    await readFile(path.join(projectRoot, 'tests/unit/post.model.test.ts'), 'utf8'),
    renderScaffoldModelTestFile(resource),
  );
  assert.equal(
    await readFile(path.join(projectRoot, 'tests/integration/posts-controller.test.ts'), 'utf8'),
    renderScaffoldIntegrationTestFile(resource),
  );
  assert.equal(
    await readFile(path.join(projectRoot, 'tests/e2e/posts-smoke.test.ts'), 'utf8'),
    renderScaffoldE2ETestFile(resource),
  );
});


test('repeated generation keeps manifest deterministic and deduplicated', async () => {
  const projectRoot = await createProject('forge-manifest-repeat-');

  await generateModel({ projectRoot, modelName: 'Post', fieldArgs: ['title:string'] });
  await generateModel({ projectRoot, modelName: 'Post', fieldArgs: ['title:string'] });

  await writePostModel(projectRoot);
  await generateScaffold({ projectRoot, name: 'Post' });
  await generateScaffold({ projectRoot, name: 'Post' });

  const manifest = JSON.parse(await readFile(path.join(projectRoot, '.forge/manifest.json'), 'utf8'));

  assert.deepEqual(manifest.models, ['Post']);
  assert.deepEqual(manifest.modelFilePaths, ['app/models/post.model.ts']);
  assert.deepEqual(manifest.controllers, ['PostsController']);
  assert.deepEqual(manifest.controllerFilePaths, ['app/controllers/posts.controller.ts']);
  assert.equal(manifest.views.filter((view: string) => view.startsWith('posts/')).length, 5);
  assert.equal(manifest.viewPaths.filter((viewPath: string) => viewPath.startsWith('app/views/posts/')).length, 5);
  assert.equal(manifest.routes.filter((route: { name: string }) => route.name.startsWith('posts.')).length, 7);
  assert.deepEqual(manifest.resources, [{
    name: 'posts',
    model: 'Post',
    modelFilePath: 'app/models/post.model.ts',
    controller: 'PostsController',
    controllerFilePath: 'app/controllers/posts.controller.ts',
    viewsPath: 'app/views/posts',
    routeNames: ['posts.create', 'posts.delete', 'posts.edit', 'posts.index', 'posts.new', 'posts.show', 'posts.update'],
  }]);
});

test('generated scaffold tests run against the current runtime behavior', async () => {
  const projectRoot = await createProject('forge-generated-tests-');

  await writePostModel(projectRoot);
  await generateScaffold({ projectRoot, name: 'Post' });
  await linkForgePackages(projectRoot);

  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_TEST_WORKER_ID;

  const { stdout, stderr } = await execFileAsync('node', [
    '--test',
    'tests/unit/post.model.test.ts',
    'tests/integration/posts-controller.test.ts',
    'tests/e2e/posts-smoke.test.ts',
  ], {
    cwd: projectRoot,
    env: childEnv,
  });

  assert.match(`${stdout}\n${stderr}`, /# pass 4/);
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
  await mkdir(path.join(projectRoot, 'app/views/home'), { recursive: true });
  await mkdir(path.join(projectRoot, 'app/views/layouts'), { recursive: true });
  await mkdir(path.join(projectRoot, 'config'), { recursive: true });
  await mkdir(path.join(projectRoot, 'db'), { recursive: true });
  await mkdir(path.join(projectRoot, '.forge'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests/unit'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests/integration'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests/e2e'), { recursive: true });

  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'generated-app', type: 'module' }, null, 2) + '\n');

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

  await writeFile(path.join(projectRoot, 'app/views/layouts/app.html'), '<body>{{content}}</body>\n', 'utf8');
  await writeFile(path.join(projectRoot, 'app/views/layouts/auth.html'), '<body>{{content}}</body>\n', 'utf8');
  await writeFile(path.join(projectRoot, 'app/views/home/index.html'), '<main><h1>Home</h1></main>\n', 'utf8');

  await writeFile(
    path.join(projectRoot, '.forge/manifest.json'),
    JSON.stringify(
      {
        app: { name: 'demo-app' },
        framework: { name: 'forge', version: '0.0.0' },
        resources: [],
        models: [],
        modelFilePaths: [],
        controllers: [],
        controllerFilePaths: [],
        routes: [
          {
            name: 'home.index',
            method: 'GET',
            path: '/',
            view: 'home/index',
          },
        ],
        views: ['layouts/app', 'layouts/auth', 'home/index'],
        viewPaths: ['app/views/home/index.html', 'app/views/layouts/app.html', 'app/views/layouts/auth.html'],
        conventions: {},
      },
      null,
      2,
    ) + '\n',
  );

  return projectRoot;
}

async function writePostModel(projectRoot: string): Promise<void> {
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
}

async function linkForgePackages(projectRoot: string): Promise<void> {
  const scopeRoot = path.join(projectRoot, 'node_modules', '@forge');
  await mkdir(scopeRoot, { recursive: true });

  for (const packageName of ['core', 'runtime']) {
    await symlink(path.join(repositoryRoot, 'packages', packageName), path.join(scopeRoot, packageName), 'dir');
  }
}
