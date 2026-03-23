import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ForgeModelMetadata, ForgePrimitiveFieldType } from '@forge/core';
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

export type ForgeScaffoldField = {
  name: string;
  type: ForgePrimitiveFieldType;
  required: boolean;
  default?: string | boolean | number;
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
  testFilePaths: string[];
};

type ForgeScaffoldResource = {
  modelName: string;
  modelFileBasename: string;
  fields: ForgeScaffoldField[];
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
  const resource = await normalizeScaffoldName(options.projectRoot, options.name);
  const controllerFilePath = path.join(
    options.projectRoot,
    'app/controllers',
    `${resource.controllerFileName}.controller.ts`,
  );
  const viewsRoot = path.join(options.projectRoot, 'app/views', resource.collectionPath);
  const routesPath = path.join(options.projectRoot, 'config/routes.ts');
  const manifestPath = path.join(options.projectRoot, '.forge/manifest.json');
  const unitTestFilePath = path.join(options.projectRoot, 'tests/unit', `${resource.modelFileBasename}.model.test.ts`);
  const integrationTestFilePath = path.join(options.projectRoot, 'tests/integration', `${resource.controllerFileName}-controller.test.ts`);
  const e2eTestFilePath = path.join(options.projectRoot, 'tests/e2e', `${resource.controllerFileName}-smoke.test.ts`);
  const testFilePaths = [unitTestFilePath, integrationTestFilePath, e2eTestFilePath];
  const viewPaths = [
    path.join(viewsRoot, 'index.html'),
    path.join(viewsRoot, 'show.html'),
    path.join(viewsRoot, 'new.html'),
    path.join(viewsRoot, 'edit.html'),
    path.join(viewsRoot, '_form.html'),
  ];

  await mkdir(path.dirname(controllerFilePath), { recursive: true });
  await mkdir(viewsRoot, { recursive: true });
  await mkdir(path.join(options.projectRoot, 'tests/unit'), { recursive: true });
  await mkdir(path.dirname(integrationTestFilePath), { recursive: true });
  await mkdir(path.dirname(e2eTestFilePath), { recursive: true });

  await writeFile(controllerFilePath, renderScaffoldControllerFile(resource), 'utf8');
  await writeFile(viewPaths[0], renderScaffoldIndexView(resource), 'utf8');
  await writeFile(viewPaths[1], renderScaffoldShowView(), 'utf8');
  await writeFile(viewPaths[2], renderScaffoldNewView(), 'utf8');
  await writeFile(viewPaths[3], renderScaffoldEditView(), 'utf8');
  await writeFile(viewPaths[4], renderScaffoldFormPartial(resource), 'utf8');
  await writeFile(unitTestFilePath, renderScaffoldModelTestFile(resource), 'utf8');
  await writeFile(integrationTestFilePath, renderScaffoldIntegrationTestFile(resource), 'utf8');
  await writeFile(e2eTestFilePath, renderScaffoldE2ETestFile(resource), 'utf8');

  await updateRoutesFile(routesPath, resource.routes);
  await updateScaffoldManifestFile(manifestPath, resource);

  return {
    resourceName: resource.modelName,
    controllerClassName: resource.controllerClassName,
    controllerFilePath,
    viewPaths,
    routesPath,
    manifestPath,
    testFilePath: integrationTestFilePath,
    testFilePaths,
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
  const formValueLines = resource.fields.flatMap((field) => renderControllerFormValueLines(field));

  return [
    "import type { ForgeControllerContext, ForgeValidationResult } from '@forge/runtime';",
    "import { validateResourceInput } from '@forge/runtime';",
    `import { ${resource.modelName} } from '../models/${resource.modelFileBasename}.model.ts';`,
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
    "    const id = request.params.id ?? '';",
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
    `    return response.render('${resource.viewPrefix}/new', this.buildFormData({`,
    `      pageTitle: 'New ${resource.singularTitle}',`,
    `      heading: 'New ${resource.singularTitle}',`,
    `      formAction: '${resource.basePath}',`,
    `      submitLabel: 'Create ${resource.singularTitle}',`,
    '    }));',
    '  }',
    '',
    '  async create({ request, response }: ForgeControllerContext) {',
    `    const validation = validateResourceInput(${resource.modelName}, request.body);`,
    '',
    '    if (!validation.valid) {',
    `      return response.render('${resource.viewPrefix}/new', this.buildFormData({`,
    `        pageTitle: 'New ${resource.singularTitle}',`,
    `        heading: 'New ${resource.singularTitle}',`,
    `        formAction: '${resource.basePath}',`,
    `        submitLabel: 'Create ${resource.singularTitle}',`,
    '      }, validation), { status: 422 });',
    '    }',
    '',
    `    return response.redirect('${resource.basePath}');`,
    '  }',
    '',
    '  async edit({ request, response }: ForgeControllerContext) {',
    "    const id = request.params.id ?? '';",
    '',
    `    return response.render('${resource.viewPrefix}/edit', this.buildFormData({`,
    `      pageTitle: 'Edit ${resource.singularTitle}',`,
    `      heading: 'Edit ${resource.singularTitle}',`,
    '      id,',
    `      formAction: \`${showUpdatePath}\`,`,
    `      submitLabel: 'Update ${resource.singularTitle}',`,
    '    }));',
    '  }',
    '',
    '  async update({ request, response }: ForgeControllerContext) {',
    "    const id = request.params.id ?? '';",
    `    const validation = validateResourceInput(${resource.modelName}, request.body);`,
    '',
    '    if (!validation.valid) {',
    `      return response.render('${resource.viewPrefix}/edit', this.buildFormData({`,
    `        pageTitle: 'Edit ${resource.singularTitle}',`,
    `        heading: 'Edit ${resource.singularTitle}',`,
    '        id,',
    `        formAction: \`${showUpdatePath}\`,`,
    `        submitLabel: 'Update ${resource.singularTitle}',`,
    '      }, validation), { status: 422 });',
    '    }',
    '',
    `    return response.redirect(\`${showRecordPath}\`);`,
    '  }',
    '',
    '  async delete({ response }: ForgeControllerContext) {',
    `    return response.redirect('${resource.basePath}');`,
    '  }',
    '',
    "  private buildFormData(baseData: Record<string, string>, validation?: ForgeValidationResult) {",
    '    const values = validation?.values ?? {};',
    '    const errors = validation?.errors ?? {};',
    '',
    '    return {',
    '      ...baseData,',
    "      errorsHeading: validation ? 'Please correct the errors below.' : '',",
    "      errorsSummary: validation ? this.renderErrorsSummary(errors) : '',",
    ...formValueLines,
    '    };',
    '  }',
    '',
    "  private renderErrorsSummary(errors: ForgeValidationResult['errors']) {",
    '    const messages = Object.values(errors).flat();',
    '',
    '    if (messages.length === 0) {',
    "      return '';",
    '    }',
    '',
    "    return ['<ul>', ...messages.map((message) => `  <li>${message}</li>`), '</ul>'].join('\\n');",
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
    '  <div>{{errorsHeading}}</div>',
    '  <div>{{errorsSummary}}</div>',
    ...resource.fields.flatMap((field) => renderFormFieldTemplate(resource, field)),
    '  <button type="submit">{{submitLabel}}</button>',
    '</form>',
    '',
  ].join('\n');
}

export function renderScaffoldModelTestFile(resource: ForgeScaffoldResource): string {
  const requiredField = resource.fields.find((field) => field.required) ?? resource.fields[0];
  const successEntries = resource.fields.map((field) => {
    if (field.required) {
      return `      ${field.name}: ${renderTestInputValue(field, `Example ${humanize(field.name)}`)},`;
    }

    return null;
  }).filter((line): line is string => line !== null);
  const expectedValueLines = resource.fields.map((field) => {
    const provided = field.required;

    if (provided) {
      return `      ${field.name}: ${renderExpectedValue(field, `Example ${humanize(field.name)}`)},`;
    }

    if (field.default !== undefined) {
      return `      ${field.name}: ${renderExpectedLiteral(field.default)},`;
    }

    if (field.type === 'boolean') {
      return `      ${field.name}: false,`;
    }

    return null;
  }).filter((line): line is string => line !== null);

  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    `import { ${resource.modelName} } from '../../app/models/${resource.modelFileBasename}.model.ts';`,
    "import { validateResourceInput } from '@forge/runtime';",
    '',
    `test('${resource.modelName} validation rejects blank ${requiredField.name}', () => {`,
    `  const result = validateResourceInput(${resource.modelName}, { ${requiredField.name}: '' });`,
    '',
    '  assert.equal(result.valid, false);',
    `  assert.deepEqual(result.errors.${requiredField.name}, ['${capitalize(humanize(requiredField.name))} is required.']);`,
    '});',
    '',
    `test('${resource.modelName} validation applies the current scaffold defaults', () => {`,
    `  const result = validateResourceInput(${resource.modelName}, {`,
    ...successEntries,
    '  });',
    '',
    '  assert.deepEqual(result, {',
    '    valid: true,',
    '    values: {',
    ...expectedValueLines,
    '    },',
    '    errors: {},',
    '  });',
    '});',
    '',
  ].join('\n');
}

export function renderScaffoldIntegrationTestFile(resource: ForgeScaffoldResource): string {
  const requiredField = resource.fields.find((field) => field.required) ?? resource.fields[0];
  const optionalField = resource.fields.find((field) => field.name !== requiredField.name) ?? requiredField;
  const validBodyEntries = resource.fields.map((field) => {
    if (field.required) {
      return `      ${field.name}: ${renderFormEncodedValue(field, `Example ${humanize(field.name)}`)},`;
    }

    if (field.type === 'boolean') {
      return `      ${field.name}: 'true',`;
    }

    if (field.type === 'integer' || field.type === 'decimal') {
      return `      ${field.name}: '7',`;
    }

    return `      ${field.name}: '${humanize(field.name)} value',`;
  });

  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { ForgeApp, registerRoutesFromConfig } from '@forge/runtime';",
    `import { ${resource.controllerClassName} } from '../../app/controllers/${resource.controllerFileName}.controller.ts';`,
    "import { routes } from '../../config/routes.ts';",
    '',
    `test('${resource.controllerClassName} handles the scaffold happy path and validation errors', async () => {`,
    "  const app = new ForgeApp({ rootDir: process.cwd() });",
    `  await registerRoutesFromConfig(app, routes, { controllers: { ${resource.controllerClassName} } });`,
    "  const server = await app.boot({ port: 0 });",
    '',
    '  try {',
    `    const indexResponse = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}\`);`,
    `    const newResponse = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}/new\`);`,
    `    const invalidCreateResponse = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}\`, {`,
    "      method: 'POST',",
    "      headers: { 'content-type': 'application/x-www-form-urlencoded' },",
    `      body: new URLSearchParams({ ${requiredField.name}: '', ${optionalField.name}: '${humanize(optionalField.name)} draft' }),`,
    '    });',
    `    const showResponse = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}/42\`);`,
    `    const validCreateResponse = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}\`, {`,
    "      method: 'POST',",
    "      headers: { 'content-type': 'application/x-www-form-urlencoded' },",
    '      redirect: "manual",',
    '      body: new URLSearchParams({',
    ...validBodyEntries,
    '      }),',
    '    });',
    '',
    '    assert.equal(indexResponse.status, 200);',
    `    assert.match(await indexResponse.text(), /New ${resource.singularTitle}/);`,
    '',
    '    assert.equal(newResponse.status, 200);',
    `    assert.match(await newResponse.text(), /Create ${resource.singularTitle}/);`,
    '',
    '    assert.equal(invalidCreateResponse.status, 422);',
    `    assert.match(await invalidCreateResponse.text(), /${capitalize(humanize(requiredField.name))} is required\./);`,
    '',
    '    assert.equal(showResponse.status, 200);',
    '    assert.match(await showResponse.text(), /ID: 42/);',
    '',
    '    assert.equal(validCreateResponse.status, 302);',
    `    assert.equal(validCreateResponse.headers.get('location'), '${resource.basePath}');`,
    '  } finally {',
    '    await server.close();',
    '  }',
    '});',
    '',
  ].join('\n');
}

export function renderScaffoldE2ETestFile(resource: ForgeScaffoldResource): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { ForgeApp, registerRoutesFromConfig } from '@forge/runtime';",
    `import { ${resource.controllerClassName} } from '../../app/controllers/${resource.controllerFileName}.controller.ts';`,
    "import { routes } from '../../config/routes.ts';",
    '',
    `test('${resource.routeBaseName} scaffold smoke test', async () => {`,
    "  const app = new ForgeApp({ rootDir: process.cwd() });",
    `  await registerRoutesFromConfig(app, routes, { controllers: { ${resource.controllerClassName} } });`,
    "  const server = await app.boot({ port: 0 });",
    '',
    '  try {',
    `    const response = await fetch(\`http://\${server.host}:\${server.port}${resource.basePath}\`);`,
    '',
    '    assert.equal(response.status, 200);',
    `    assert.match(await response.text(), /${resource.collectionTitle}/);`,
    '  } finally {',
    '    await server.close();',
    '  }',
    '});',
    '',
  ].join('\n');
}

export function renderScaffoldTestFile(resource: ForgeScaffoldResource): string {
  return renderScaffoldIntegrationTestFile(resource);
}

function renderTestInputValue(field: ForgeScaffoldField, fallbackText: string): string {
  if (field.type === 'boolean') {
    return "'true'";
  }

  if (field.type === 'integer' || field.type === 'decimal') {
    return "'7'";
  }

  return `'${fallbackText}'`;
}

function renderFormEncodedValue(field: ForgeScaffoldField, fallbackText: string): string {
  return renderTestInputValue(field, fallbackText);
}

function renderExpectedValue(field: ForgeScaffoldField, fallbackText: string): string {
  if (field.type === 'boolean') {
    return 'true';
  }

  if (field.type === 'integer' || field.type === 'decimal') {
    return '7';
  }

  return `'${fallbackText}'`;
}

function renderExpectedLiteral(value: string | boolean | number): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }

  return String(value);
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

export function parseModelMetadata(modelSource: string, modelName: string): ForgeModelMetadata {
  const lines = modelSource.split('\n');
  const startIndex = lines.findIndex((line) => line.includes(`defineModel('${modelName}', {`));

  if (startIndex === -1) {
    throw new Error(`Could not find defineModel('${modelName}', { ... }) in model source.`);
  }

  const fields: ForgeScaffoldField[] = [];

  for (const line of lines.slice(startIndex + 1)) {
    const trimmedLine = line.trim();

    if (trimmedLine === '});') {
      break;
    }

    if (trimmedLine.length === 0) {
      continue;
    }

    fields.push(parseScaffoldFieldLine(trimmedLine));
  }

  return {
    kind: 'model',
    name: modelName,
    fields,
  };
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

async function normalizeScaffoldName(projectRoot: string, name: string): Promise<ForgeScaffoldResource> {
  const modelName = normalizeModelName(name);
  const pluralName = pluralize(modelName);
  const collectionPath = pluralize(toFileBasename(modelName));
  const controllerClassName = `${pluralName}Controller`;
  const routeBaseName = collectionPath;
  const basePath = `/${collectionPath}`;
  const singularTitle = humanize(modelName);
  const collectionTitle = humanize(pluralName);
  const modelFileBasename = toFileBasename(modelName);
  const fields = await loadScaffoldFields(projectRoot, modelName, modelFileBasename);

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
    modelFileBasename,
    fields,
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

async function loadScaffoldFields(projectRoot: string, modelName: string, modelFileBasename: string): Promise<ForgeScaffoldField[]> {
  const modelFilePath = path.join(projectRoot, 'app/models', `${modelFileBasename}.model.ts`);
  const modelSource = await readFile(modelFilePath, 'utf8');
  const metadata = parseModelMetadata(modelSource, modelName);

  if (metadata.fields.length === 0) {
    throw new Error(`Model ${modelName} does not define any fields to scaffold.`);
  }

  return metadata.fields.map((field) => ({
    name: field.name,
    type: field.type,
    required: field.required,
    ...(field.default !== undefined ? { default: field.default } : {}),
  }));
}

function parseScaffoldFieldLine(line: string): ForgeScaffoldField {
  const match = line.match(/^(\w+):\s*field\.(string|text|boolean|integer|decimal|date)\(([^)]*)\),?$/);

  if (!match) {
    throw new Error(`Unsupported model field definition for scaffolding: ${line}`);
  }

  const [, name, type, rawOptions] = match;
  const options = rawOptions.trim();

  return {
    name,
    type: type as ForgePrimitiveFieldType,
    required: /required:\s*true/.test(options),
    ...parseDefaultOption(options),
  };
}

function parseDefaultOption(options: string): { default?: string | boolean | number } {
  const match = options.match(/default:\s*([^,}]+)/);

  if (!match) {
    return {};
  }

  const value = match[1].trim();

  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return { default: value.slice(1, -1) };
  }

  if (value === 'true') {
    return { default: true };
  }

  if (value === 'false') {
    return { default: false };
  }

  const numericValue = Number(value);

  if (!Number.isNaN(numericValue)) {
    return { default: numericValue };
  }

  return {};
}

function renderControllerFormValueLines(field: ForgeScaffoldField): string[] {
  const defaultLiteral = renderDefaultLiteral(field.default);

  if (field.type === 'boolean') {
    return [
      `${field.name}Checked: values.${field.name} === true ? 'checked' : '',`,
      `${field.name}Error: errors.${field.name}?.[0] ?? '',`,
    ].map((line) => `      ${line}`);
  }

  return [
    `${field.name}: String(values.${field.name} ?? ${defaultLiteral}),`,
    `${field.name}Error: errors.${field.name}?.[0] ?? '',`,
  ].map((line) => `      ${line}`);
}

function renderFormFieldTemplate(resource: ForgeScaffoldResource, field: ForgeScaffoldField): string[] {
  const label = `${resource.singularTitle} ${humanize(field.name).toLowerCase()}`;

  if (field.type === 'text') {
    return [
      `  <div>{{${field.name}Error}}</div>`,
      '  <label>',
      `    ${label}`,
      `    <textarea name="${field.name}">{{${field.name}}}</textarea>`,
      '  </label>',
    ];
  }

  if (field.type === 'boolean') {
    return [
      `  <div>{{${field.name}Error}}</div>`,
      '  <label>',
      `    <input type="checkbox" name="${field.name}" value="true" {{${field.name}Checked}}>`,
      `    ${label}`,
      '  </label>',
    ];
  }

  return [
    `  <div>{{${field.name}Error}}</div>`,
    '  <label>',
    `    ${label}`,
    `    <input type="${resolveInputType(field.type)}" name="${field.name}" value="{{${field.name}}}">`,
    '  </label>',
  ];
}

function renderDefaultLiteral(value: string | boolean | number | undefined): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return "''";
}

function resolveInputType(type: ForgePrimitiveFieldType): string {
  switch (type) {
    case 'integer':
    case 'decimal':
      return 'number';
    case 'date':
      return 'date';
    case 'string':
    case 'text':
    case 'boolean':
      return 'text';
    default:
      return assertNever(type);
  }
}

function toFileBasename(modelName: string): string {
  return modelName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/-/g, ' ').replace(/_/g, ' ');
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
