import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ForgePrimitiveFieldType } from '@forge/core';
import {
  addControllerToManifest,
  addModelToManifest,
  addRouteDefinitionsToManifest,
  addViewsToManifest,
  readManifest,
  type ForgeManifestRoute,
  writeManifest,
} from '@forge/manifest';

export const packageName = '@forge/generators';

const SUPPORTED_FIELD_TYPES = ['string', 'text', 'boolean', 'integer', 'decimal', 'date'] as const;

export type ForgeModelFieldInput = {
  name: string;
  type: ForgePrimitiveFieldType;
};

export type ForgeGenerateModelOptions = {
  projectRoot: string;
  modelName: string;
  fieldArgs: string[];
};

export type ForgeGenerateModelResult = {
  modelName: string;
  fields: ForgeModelFieldInput[];
  modelFilePath: string;
  schemaPath: string;
  manifestPath: string;
};

export type ForgeGenerateScaffoldOptions = {
  projectRoot: string;
  name: string;
};

export type ForgeGenerateScaffoldResult = {
  resourceName: string;
  controllerClassName: string;
  controllerFilePath: string;
  viewPaths: string[];
  routesPath: string;
  manifestPath: string;
  testFilePath: string;
};

type ForgeScaffoldResource = {
  modelName: string;
  collectionPath: string;
  controllerClassName: string;
  controllerFileName: string;
  routeBaseName: string;
  basePath: string;
  singularTitle: string;
  collectionTitle: string;
  collectionLabel: string;
  viewPrefix: string;
  routes: ForgeManifestRoute[];
  viewManifestEntries: string[];
};

export async function generateModel(options: ForgeGenerateModelOptions): Promise<ForgeGenerateModelResult> {
  const modelName = normalizeModelName(options.modelName);
  const fields = parseModelFields(options.fieldArgs);
  const modelFilePath = path.join(options.projectRoot, 'app/models', `${toFileBasename(modelName)}.model.ts`);
  const schemaPath = path.join(options.projectRoot, 'db/schema.prisma');
  const manifestPath = path.join(options.projectRoot, '.forge/manifest.json');

  await mkdir(path.dirname(modelFilePath), { recursive: true });
  await writeFile(modelFilePath, renderModelFile(modelName, fields), 'utf8');
  await updateSchemaFile(schemaPath, modelName, fields);
  await updateManifestFile(manifestPath, modelName);

  return {
    modelName,
    fields,
    modelFilePath,
    schemaPath,
    manifestPath,
  };
}

export async function generateScaffold(
  options: ForgeGenerateScaffoldOptions,
): Promise<ForgeGenerateScaffoldResult> {
  const resource = normalizeScaffoldName(options.name);
  const controllerFilePath = path.join(
    options.projectRoot,
    'app/controllers',
    `${resource.controllerFileName}.controller.ts`,
  );
  const viewsRoot = path.join(options.projectRoot, 'app/views', resource.collectionPath);
  const routesPath = path.join(options.projectRoot, 'config/routes.ts');
  const manifestPath = path.join(options.projectRoot, '.forge/manifest.json');
  const testFilePath = path.join(options.projectRoot, 'tests/integration', `${resource.controllerFileName}-controller.test.ts`);
  const viewPaths = [
    path.join(viewsRoot, 'index.html'),
    path.join(viewsRoot, 'show.html'),
    path.join(viewsRoot, 'new.html'),
    path.join(viewsRoot, 'edit.html'),
    path.join(viewsRoot, '_form.html'),
  ];

  await mkdir(path.dirname(controllerFilePath), { recursive: true });
  await mkdir(viewsRoot, { recursive: true });
  await mkdir(path.dirname(testFilePath), { recursive: true });

  await writeFile(controllerFilePath, renderScaffoldControllerFile(resource), 'utf8');
  await writeFile(viewPaths[0], renderScaffoldIndexView(resource), 'utf8');
  await writeFile(viewPaths[1], renderScaffoldShowView(), 'utf8');
  await writeFile(viewPaths[2], renderScaffoldNewView(), 'utf8');
  await writeFile(viewPaths[3], renderScaffoldEditView(), 'utf8');
  await writeFile(viewPaths[4], renderScaffoldFormPartial(resource), 'utf8');
  await writeFile(testFilePath, renderScaffoldTestFile(resource), 'utf8');

  await updateRoutesFile(routesPath, resource.routes);
  await updateScaffoldManifestFile(manifestPath, resource);

  return {
    resourceName: resource.modelName,
    controllerClassName: resource.controllerClassName,
    controllerFilePath,
    viewPaths,
    routesPath,
    manifestPath,
    testFilePath,
  };
}

export function parseModelFields(fieldArgs: string[]): ForgeModelFieldInput[] {
  return fieldArgs.map(parseModelField);
}

export function parseModelField(fieldArg: string): ForgeModelFieldInput {
  const separatorIndex = fieldArg.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === fieldArg.length - 1) {
    throw new Error(
      `Invalid field definition: ${fieldArg}. Expected format name:type using one of: ${SUPPORTED_FIELD_TYPES.join(', ')}`,
    );
  }

  const fieldName = fieldArg.slice(0, separatorIndex).trim();
  const rawType = fieldArg.slice(separatorIndex + 1).trim();

  if (!isValidIdentifier(fieldName)) {
    throw new Error(`Invalid field name: ${fieldName}. Use letters, numbers, and underscores, starting with a letter.`);
  }

  if (!isSupportedFieldType(rawType)) {
    throw new Error(`Unsupported field type: ${rawType}. Supported types: ${SUPPORTED_FIELD_TYPES.join(', ')}`);
  }

  return {
    name: fieldName,
    type: rawType,
  };
}

export function renderModelFile(modelName: string, fields: ForgeModelFieldInput[]): string {
  const fieldLines = fields.map((field) => `  ${field.name}: field.${field.type}(),`);

  return [
    "import { defineModel, field } from '@forge/core';",
    '',
    `export const ${modelName} = defineModel('${modelName}', {`,
    ...fieldLines,
    '});',
    '',
  ].join('\n');
}

export function renderSchemaModel(modelName: string, fields: ForgeModelFieldInput[]): string {
  const schemaLines = fields.map((field) => `  ${field.name} ${toPrismaType(field.type)}`);

  return [
    `model ${modelName} {`,
    '  id Int @id @default(autoincrement())',
    ...schemaLines,
    '}',
  ].join('\n');
}

export function renderScaffoldControllerFile(resource: ForgeScaffoldResource): string {
  const showRecordPath = `${resource.basePath}/\${id}`;
  const showEditPath = `${showRecordPath}/edit`;
  const showDeletePath = `${showRecordPath}/delete`;
  const showUpdatePath = `${showRecordPath}/update`;

  return [
    "import type { ForgeControllerContext } from '@forge/runtime';",
    '',
    `export class ${resource.controllerClassName} {`,
    '  async index({ response }: ForgeControllerContext) {',
    `    return response.render('${resource.viewPrefix}/index', {`,
    `      pageTitle: '${resource.collectionTitle}',`,
    `      heading: '${resource.collectionTitle}',`,
    `      emptyMessage: 'No ${resource.collectionLabel} yet.',`,
    `      newPath: '${resource.basePath}/new',`,
    '    });',
    '  }',
    '',
    '  async show({ request, response }: ForgeControllerContext) {',
    '    const id = request.params.id ?? \'\';',
    '',
    `    return response.render('${resource.viewPrefix}/show', {`,
    `      pageTitle: '${resource.singularTitle}',`,
    `      heading: '${resource.singularTitle}',`,
    '      id,',
    `      editPath: \`${showEditPath}\`,`,
    `      deletePath: \`${showDeletePath}\`,`,
    '    });',
    '  }',
    '',
    '  async new({ response }: ForgeControllerContext) {',
    `    return response.render('${resource.viewPrefix}/new', {`,
    `      pageTitle: 'New ${resource.singularTitle}',`,
    `      heading: 'New ${resource.singularTitle}',`,
    `      formAction: '${resource.basePath}',`,
    `      submitLabel: 'Create ${resource.singularTitle}',`,
    '      name: \'\',',
    '    });',
    '  }',
    '',
    '  async create({ response }: ForgeControllerContext) {',
    `    return response.redirect('${resource.basePath}');`,
    '  }',
    '',
    '  async edit({ request, response }: ForgeControllerContext) {',
    '    const id = request.params.id ?? \'\';',
    '',
    `    return response.render('${resource.viewPrefix}/edit', {`,
    `      pageTitle: 'Edit ${resource.singularTitle}',`,
    `      heading: 'Edit ${resource.singularTitle}',`,
    '      id,',
    `      formAction: \`${showUpdatePath}\`,`,
    `      submitLabel: 'Update ${resource.singularTitle}',`,
    '      name: \'\',',
    '    });',
    '  }',
    '',
    '  async update({ request, response }: ForgeControllerContext) {',
    '    const id = request.params.id ?? \'\';',
    `    return response.redirect(\`${showRecordPath}\`);`,
    '  }',
    '',
    '  async delete({ response }: ForgeControllerContext) {',
    `    return response.redirect('${resource.basePath}');`,
    '  }',
    '}',
    '',
  ].join('\n');
}

export function renderScaffoldIndexView(resource: ForgeScaffoldResource): string {
  return [
    '<main>',
    '  <h1>{{heading}}</h1>',
    '  <p>{{emptyMessage}}</p>',
    `  <p><a href="{{newPath}}">New ${resource.singularTitle}</a></p>`,
    '</main>',
    '',
  ].join('\n');
}

export function renderScaffoldShowView(): string {
  return [
    '<main>',
    '  <h1>{{heading}}</h1>',
    '  <p>ID: {{id}}</p>',
    '  <p><a href="{{editPath}}">Edit</a></p>',
    '  <form method="POST" action="{{deletePath}}">',
    '    <button type="submit">Delete</button>',
    '  </form>',
    '</main>',
    '',
  ].join('\n');
}

export function renderScaffoldNewView(): string {
  return [
    '<main>',
    '  <h1>{{heading}}</h1>',
    '  {{> _form}}',
    '</main>',
    '',
  ].join('\n');
}

export function renderScaffoldEditView(): string {
  return [
    '<main>',
    '  <h1>{{heading}}</h1>',
    '  <p>Editing record {{id}}</p>',
    '  {{> _form}}',
    '</main>',
    '',
  ].join('\n');
}

export function renderScaffoldFormPartial(resource: ForgeScaffoldResource): string {
  return [
    '<form method="POST" action="{{formAction}}">',
    '  <label>',
    `    ${resource.singularTitle} name`,
    '    <input type="text" name="name" value="{{name}}">',
    '  </label>',
    '  <button type="submit">{{submitLabel}}</button>',
    '</form>',
    '',
  ].join('\n');
}

export function renderScaffoldTestFile(resource: ForgeScaffoldResource): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    `import { ${resource.controllerClassName} } from '../../app/controllers/${resource.controllerFileName}.controller.ts';`,
    `import { routes } from '../../config/routes.ts';`,
    '',
    `test('${resource.controllerClassName} exposes the standard scaffold actions', () => {`,
    `  const controller = new ${resource.controllerClassName}();`,
    '',
    "  assert.equal(typeof controller.index, 'function');",
    "  assert.equal(typeof controller.show, 'function');",
    "  assert.equal(typeof controller.new, 'function');",
    "  assert.equal(typeof controller.create, 'function');",
    "  assert.equal(typeof controller.edit, 'function');",
    "  assert.equal(typeof controller.update, 'function');",
    "  assert.equal(typeof controller.delete, 'function');",
    '});',
    '',
    `test('${resource.routeBaseName} scaffold routes are registered', () => {`,
    `  const routeNames = routes`,
    `    .filter((route) => route.name.startsWith('${resource.routeBaseName}.'))`,
    '    .map((route) => route.name);',
    '',
    '  assert.deepEqual(routeNames, [',
    ...resource.routes.map((route) => `    '${route.name}',`),
    '  ]);',
    '});',
    '',
  ].join('\n');
}

export function renderRoutesConfigBlock(routes: ForgeManifestRoute[]): string {
  return routes
    .map((route) => [
      '  {',
      `    name: '${route.name}',`,
      `    method: '${route.method}',`,
      `    path: '${route.path}',`,
      `    controller: '${route.controller ?? ''}',`,
      `    action: '${route.action ?? ''}',`,
      '  },',
    ].join('\n'))
    .join('\n');
}

async function updateSchemaFile(schemaPath: string, modelName: string, fields: ForgeModelFieldInput[]): Promise<void> {
  const currentSchema = await readFile(schemaPath, 'utf8');
  const modelBlock = renderSchemaModel(modelName, fields);
  const nextSchema = currentSchema.trimEnd().length === 0
    ? `${modelBlock}\n`
    : `${currentSchema.trimEnd()}\n\n${modelBlock}\n`;

  await writeFile(schemaPath, nextSchema, 'utf8');
}

async function updateManifestFile(manifestPath: string, modelName: string): Promise<void> {
  const manifest = await readManifest(manifestPath);
  const nextManifest = addModelToManifest(manifest, modelName);
  await writeManifest(manifestPath, nextManifest);
}

async function updateScaffoldManifestFile(manifestPath: string, resource: ForgeScaffoldResource): Promise<void> {
  const manifest = await readManifest(manifestPath);
  const withController = addControllerToManifest(manifest, resource.controllerClassName);
  const withRoutes = addRouteDefinitionsToManifest(withController, resource.routes);
  const withViews = addViewsToManifest(withRoutes, resource.viewManifestEntries);
  await writeManifest(manifestPath, withViews);
}

async function updateRoutesFile(routesPath: string, routes: ForgeManifestRoute[]): Promise<void> {
  const currentRoutes = await readFile(routesPath, 'utf8');

  if (routes.every((route) => currentRoutes.includes(`name: '${route.name}'`))) {
    return;
  }

  const insertionPoint = '] as const;';
  const index = currentRoutes.indexOf(insertionPoint);

  if (index === -1) {
    throw new Error(`Could not update routes file at ${routesPath}. Expected routes array ending with ] as const;`);
  }

  const existingEntries = currentRoutes.slice(0, index).trimEnd();
  const suffix = currentRoutes.slice(index);
  const separator = existingEntries.endsWith('[') ? '\n' : ',\n';
  const routeBlock = renderRoutesConfigBlock(routes);
  const nextRoutes = `${trimTrailingArrayComma(existingEntries)}${separator}${routeBlock}\n${suffix}`;

  await writeFile(routesPath, nextRoutes, 'utf8');
}

function trimTrailingArrayComma(value: string): string {
  return value.replace(/,\s*$/, '');
}

function normalizeModelName(modelName: string): string {
  const trimmedModelName = modelName.trim();

  if (!/^[A-Z][A-Za-z0-9]*$/.test(trimmedModelName)) {
    throw new Error('Model name must be PascalCase and singular, for example Post.');
  }

  return trimmedModelName;
}

function normalizeScaffoldName(name: string): ForgeScaffoldResource {
  const modelName = normalizeModelName(name);
  const pluralName = pluralize(modelName);
  const collectionPath = pluralize(toFileBasename(modelName));
  const controllerClassName = `${pluralName}Controller`;
  const routeBaseName = collectionPath;
  const basePath = `/${collectionPath}`;
  const singularTitle = humanize(modelName);
  const collectionTitle = humanize(pluralName);

  const routes: ForgeManifestRoute[] = [
    { name: `${routeBaseName}.index`, method: 'GET', path: basePath, controller: controllerClassName, action: 'index' },
    { name: `${routeBaseName}.new`, method: 'GET', path: `${basePath}/new`, controller: controllerClassName, action: 'new' },
    { name: `${routeBaseName}.create`, method: 'POST', path: basePath, controller: controllerClassName, action: 'create' },
    { name: `${routeBaseName}.show`, method: 'GET', path: `${basePath}/:id`, controller: controllerClassName, action: 'show' },
    { name: `${routeBaseName}.edit`, method: 'GET', path: `${basePath}/:id/edit`, controller: controllerClassName, action: 'edit' },
    { name: `${routeBaseName}.update`, method: 'POST', path: `${basePath}/:id/update`, controller: controllerClassName, action: 'update' },
    { name: `${routeBaseName}.delete`, method: 'POST', path: `${basePath}/:id/delete`, controller: controllerClassName, action: 'delete' },
  ];

  return {
    modelName,
    collectionPath,
    controllerClassName,
    controllerFileName: collectionPath,
    routeBaseName,
    basePath,
    singularTitle,
    collectionTitle,
    collectionLabel: collectionPath,
    viewPrefix: collectionPath,
    routes,
    viewManifestEntries: [
      `${collectionPath}/_form`,
      `${collectionPath}/edit`,
      `${collectionPath}/index`,
      `${collectionPath}/new`,
      `${collectionPath}/show`,
    ],
  };
}

function toFileBasename(modelName: string): string {
  return modelName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
}

function pluralize(value: string): string {
  if (value.endsWith('s')) {
    return `${value}es`;
  }

  return `${value}s`;
}

function isValidIdentifier(value: string): boolean {
  return /^[a-z][A-Za-z0-9_]*$/.test(value);
}

function isSupportedFieldType(value: string): value is ForgePrimitiveFieldType {
  return (SUPPORTED_FIELD_TYPES as readonly string[]).includes(value);
}

function toPrismaType(type: ForgePrimitiveFieldType): string {
  switch (type) {
    case 'string':
      return 'String';
    case 'text':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'integer':
      return 'Int';
    case 'decimal':
      return 'Decimal';
    case 'date':
      return 'DateTime';
    default:
      return assertNever(type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported primitive type: ${String(value)}`);
}
