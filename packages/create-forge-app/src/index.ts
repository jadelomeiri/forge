import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const packageName = 'create-forge-app';

export type ForgeNewOptions = {
  appName: string;
  destinationRoot?: string;
};

export async function createForgeApp(options: ForgeNewOptions): Promise<CreateForgeAppResult> {
  const appName = options.appName.trim();

  if (!isValidAppName(appName)) {
    throw new Error(
      'App name must use lowercase letters, numbers, and hyphens only, and must start with a letter.',
    );
  }

  const destinationRoot = options.destinationRoot ?? process.cwd();
  const appRoot = path.resolve(destinationRoot, appName);
  const appFiles = buildAppFiles(appName);

  await mkdir(appRoot, { recursive: false });

  for (const directory of APP_DIRECTORIES) {
    await mkdir(path.join(appRoot, directory), { recursive: true });
  }

  for (const [relativePath, contents] of Object.entries(appFiles)) {
    const filePath = path.join(appRoot, relativePath);
    const parentDirectory = path.dirname(filePath);

    await mkdir(parentDirectory, { recursive: true });
    await writeFile(filePath, contents, 'utf8');
  }

  return {
    appName,
    appRoot,
    files: Object.keys(appFiles).sort(),
  };
}

export type CreateForgeAppResult = {
  appName: string;
  appRoot: string;
  files: string[];
};

const APP_DIRECTORIES = [
  'app/models',
  'app/controllers',
  'app/services',
  'app/views/layouts',
  'app/policies',
  'app/jobs',
  'app/components',
  'config',
  'db/migrations',
  'public',
  'tests/unit',
  'tests/integration',
  'tests/e2e',
  '.forge',
] as const;

function buildAppFiles(appName: string): Record<string, string> {
  return {
    '.gitignore': ['node_modules/', 'dist/', '.env'].join('\n') + '\n',
    '.forge/manifest.json': JSON.stringify(createManifest(appName), null, 2) + '\n',
    'README.md': renderReadme(appName),
    'package.json': renderPackageJson(appName),
    'tsconfig.json': renderTsconfig(),
    'config/app.ts': renderAppConfig(appName),
    'config/routes.ts': renderRoutesConfig(),
    'config/auth.ts': renderAuthConfig(),
    'config/forge.ts': renderForgeConfig(appName),
    'db/schema.prisma': renderSchema(),
    'db/seeds.ts': renderSeeds(),
    'public/.keep': '',
    'app/views/home/index.html': renderHomeView(appName),
    'app/views/layouts/app.html': renderAppLayout(appName),
    'app/views/layouts/auth.html': renderAuthLayout(appName),
    'tests/setup.ts': renderTestSetup(),
    'tests/unit/app-config.test.ts': renderUnitTest(),
    'tests/integration/home-page.test.ts': renderIntegrationTest(),
    'tests/e2e/app-smoke.test.ts': renderE2ETest(),
  };
}

function createManifest(appName: string) {
  return {
    app: {
      name: appName,
    },
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
    conventions: {
      structure: ['app', 'config', 'db', 'public', 'tests', '.forge'],
      controllers: 'plural',
      models: 'singular',
      views: 'plural folders',
    },
  };
}

function renderReadme(appName: string): string {
  return `# ${titleize(appName)}\n\nA minimal Forge app created with \`forge new\`.\n`;
}

function renderPackageJson(appName: string): string {
  return `${JSON.stringify(
    {
      name: appName,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        'db:migrate': 'prisma db push --schema db/schema.prisma',
        test: 'node --test tests/**/*.test.ts',
      },
      dependencies: {
        '@prisma/client': '^6.15.0',
      },
      devDependencies: {
        prisma: '^6.15.0',
      },
    },
    null,
    2,
  )}\n`;
}

function renderTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
      },
      include: ['app/**/*.ts', 'config/**/*.ts', 'db/**/*.ts', 'tests/**/*.ts'],
    },
    null,
    2,
  )}\n`;
}

function renderAppConfig(appName: string): string {
  return [
    `export const appConfig = {`,
    `  name: '${appName}',`,
    `  title: '${titleize(appName)}',`,
    `  defaultLayout: 'app',`,
    `} as const;`,
    '',
  ].join('\n');
}

function renderRoutesConfig(): string {
  return [
    'export const routes = [',
    '  {',
    "    name: 'home.index',",
    "    method: 'GET',",
    "    path: '/',",
    "    view: 'home/index',",
    '  },',
    '] as const;',
    '',
  ].join('\n');
}

function renderAuthConfig(): string {
  return [
    'export const authConfig = {',
    '  enabled: false,',
    '} as const;',
    '',
  ].join('\n');
}

function renderForgeConfig(appName: string): string {
  return [
    'export const forgeConfig = {',
    `  appName: '${appName}',`,
    "  manifestPath: '.forge/manifest.json',",
    '} as const;',
    '',
  ].join('\n');
}

function renderSchema(): string {
  return [
    'generator client {',
    "  provider = 'prisma-client-js'",
    '}',
    '',
    'datasource db {',
    "  provider = 'sqlite'",
    "  url      = 'file:./dev.db'",
    '}',
    '',
  ].join('\n');
}

function renderSeeds(): string {
  return ['export async function seed(): Promise<void> {', '  return Promise.resolve();', '}', ''].join('\n');
}

function renderAppLayout(appName: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    `    <title>${titleize(appName)}</title>`,
    '  </head>',
    '  <body>',
    '    {{content}}',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function renderAuthLayout(appName: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    `    <title>${titleize(appName)} · Auth</title>`,
    '  </head>',
    '  <body>',
    '    {{content}}',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function renderHomeView(appName: string): string {
  return [
    '<main>',
    `  <h1>${titleize(appName)}</h1>`,
    '  <p>Your Forge app is ready.</p>',
    '</main>',
    '',
  ].join('\n');
}

function renderTestSetup(): string {
  return [
    'export function createTestContext() {',
    "  return { status: 'ready' } as const;",
    '}',
    '',
  ].join('\n');
}

function renderUnitTest(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { appConfig } from '../../config/app.ts';",
    '',
    "test('app config exposes a default layout', () => {",
    "  assert.equal(appConfig.defaultLayout, 'app');",
    '});',
    '',
  ].join('\n');
}

function renderIntegrationTest(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { routes } from '../../config/routes.ts';",
    '',
    "test('home route is registered', () => {",
    "  assert.deepEqual(routes[0], {",
    "    name: 'home.index',",
    "    method: 'GET',",
    "    path: '/',",
    "    view: 'home/index',",
    '  });',
    '});',
    '',
  ].join('\n');
}

function renderE2ETest(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { createTestContext } from '../setup.ts';",
    '',
    "test('starter test context is available', () => {",
    "  assert.equal(createTestContext().status, 'ready');",
    '});',
    '',
  ].join('\n');
}

function titleize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(' ');
}

function isValidAppName(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
