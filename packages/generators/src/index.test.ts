import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { generateModel, parseModelFields, renderModelFile } from './index.js';

test('parseModelFields supports primitive name:type pairs', () => {
  assert.deepEqual(parseModelFields(['title:string', 'body:text', 'published:boolean']), [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'text' },
    { name: 'published', type: 'boolean' },
  ]);
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
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'forge-model-generator-'));

  await mkdir(path.join(projectRoot, 'app/models'), { recursive: true });
  await mkdir(path.join(projectRoot, 'db'), { recursive: true });
  await mkdir(path.join(projectRoot, '.forge'), { recursive: true });

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

  await writeFile(
    path.join(projectRoot, '.forge/manifest.json'),
    JSON.stringify(
      {
        app: { name: 'demo-app' },
        models: [],
        controllers: [],
        routes: [],
        views: [],
        conventions: {},
      },
      null,
      2,
    ) + '\n',
  );

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
