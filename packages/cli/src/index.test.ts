import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { runExplainModelCommand, runMigrateCommand } from './index.js';

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

test('runExplainModelCommand prints a deterministic sectioned summary from manifest and model source', async () => {
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => {
    outputs.push(String(value));
  };

  try {
    const exitCode = await runExplainModelCommand(['Post'], {
      cwd: () => '/tmp/forge-demo',
      access: async () => undefined,
      readFile: async (filePath) => {
        assert.equal(filePath, path.join('/tmp/forge-demo', 'app/models/post.model.ts'));
        return [
          "import { defineModel, field } from '@forge/core';",
          '',
          "export const Post = defineModel('Post', {",
          "  title: field.string({ required: true }),",
          "  body: field.text({ default: 'Draft body' }),",
          '  published: field.boolean({ default: false }),',
          '});',
          '',
        ].join('\n');
      },
      readManifest: async () => ({
        app: { name: 'demo' },
        framework: { name: 'forge', version: '0.0.0' },
        resources: [{
          name: 'posts',
          model: 'Post',
          modelFilePath: 'app/models/post.model.ts',
          controller: 'PostsController',
          controllerFilePath: 'app/controllers/posts.controller.ts',
          viewsPath: 'app/views/posts',
          routeNames: ['posts.show', 'posts.index'],
        }],
        models: ['Post'],
        modelFilePaths: ['app/models/post.model.ts'],
        controllers: ['PostsController'],
        controllerFilePaths: ['app/controllers/posts.controller.ts'],
        routes: [],
        views: ['posts/index', 'posts/show'],
        viewPaths: ['app/views/posts/index.html', 'app/views/posts/show.html'],
        conventions: {},
      }),
    });

    assert.equal(exitCode, 0);
    assert.equal(outputs.length, 1);
    assert.equal(
      outputs[0],
      [
        'Model: Post',
        'File path: app/models/post.model.ts',
        '',
        'Fields:',
        '- title: string',
        '- body: text',
        '- published: boolean',
        '',
        'Defaults:',
        '- body: Draft body',
        '- published: false',
        '',
        'Validations:',
        '- title: required',
        '',
        'Scaffold/controller linkage:',
        '- resource: posts',
        '- controller: PostsController',
        '- controller file: app/controllers/posts.controller.ts',
        '',
        'Views path:',
        'app/views/posts',
        '',
        'Route names:',
        '- posts.index',
        '- posts.show',
      ].join('\n'),
    );
  } finally {
    console.log = originalLog;
  }
});

test('runExplainModelCommand falls back to basic model output when scaffold linkage is absent', async () => {
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => {
    outputs.push(String(value));
  };

  try {
    const exitCode = await runExplainModelCommand(['Post'], {
      cwd: () => '/tmp/forge-demo',
      access: async () => undefined,
      readFile: async () => [
        "import { defineModel, field } from '@forge/core';",
        '',
        "export const Post = defineModel('Post', {",
        '  title: field.string(),',
        '});',
        '',
      ].join('\n'),
      readManifest: async () => ({
        app: { name: 'demo' },
        framework: { name: 'forge', version: '0.0.0' },
        resources: [],
        models: ['Post'],
        modelFilePaths: ['app/models/post.model.ts'],
        controllers: [],
        controllerFilePaths: [],
        routes: [],
        views: [],
        viewPaths: [],
        conventions: {},
      }),
    });

    assert.equal(exitCode, 0);
    assert.match(outputs[0], /Scaffold\/controller linkage:\n- resource: posts/);
    assert.match(outputs[0], /Views path:\n- \(none\)/);
    assert.match(outputs[0], /Route names:\n- \(none\)/);
  } finally {
    console.log = originalLog;
  }
});

test('runExplainModelCommand fallback resolves kebab-case model filenames for multi-word model names', async () => {
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => {
    outputs.push(String(value));
  };

  try {
    const exitCode = await runExplainModelCommand(['BlogPost'], {
      cwd: () => '/tmp/forge-demo',
      access: async (filePath) => {
        assert.equal(filePath, path.join('/tmp/forge-demo', 'app/models/blog-post.model.ts'));
      },
      readFile: async (filePath) => {
        assert.equal(filePath, path.join('/tmp/forge-demo', 'app/models/blog-post.model.ts'));

        return [
          "import { defineModel, field } from '@forge/core';",
          '',
          "export const BlogPost = defineModel('BlogPost', {",
          '  title: field.string(),',
          '});',
          '',
        ].join('\n');
      },
      readManifest: async () => ({
        app: { name: 'demo' },
        framework: { name: 'forge', version: '0.0.0' },
        resources: [],
        models: ['BlogPost'],
        modelFilePaths: ['app/models/blog-post.model.ts'],
        controllers: [],
        controllerFilePaths: [],
        routes: [],
        views: [],
        viewPaths: [],
        conventions: {},
      }),
    });

    assert.equal(exitCode, 0);
    assert.match(outputs[0], /Model: BlogPost/);
    assert.match(outputs[0], /File path: app\/models\/blog-post\.model\.ts/);
    assert.match(outputs[0], /Scaffold\/controller linkage:\n- resource: blog-posts/);
  } finally {
    console.log = originalLog;
  }
});
