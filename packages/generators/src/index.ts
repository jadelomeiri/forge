import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ForgePrimitiveFieldType } from '@forge/core';
import { addModelToManifest, readManifest, writeManifest } from '@forge/manifest';

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
    throw new Error(
      `Unsupported field type: ${rawType}. Supported types: ${SUPPORTED_FIELD_TYPES.join(', ')}`,
    );
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

function normalizeModelName(modelName: string): string {
  const trimmedModelName = modelName.trim();

  if (!/^[A-Z][A-Za-z0-9]*$/.test(trimmedModelName)) {
    throw new Error('Model name must be PascalCase and singular, for example Post.');
  }

  return trimmedModelName;
}

function toFileBasename(modelName: string): string {
  return modelName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
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
