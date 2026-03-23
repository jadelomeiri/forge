export type ForgePrimitiveFieldType = 'string' | 'text' | 'boolean' | 'integer' | 'decimal' | 'date';

export type ForgeFieldDefaultValue = string | boolean | number;

export type ForgeFieldOptions = {
  required?: boolean;
  default?: ForgeFieldDefaultValue;
};

export type ForgeFieldDefinition<Type extends ForgePrimitiveFieldType = ForgePrimitiveFieldType> = {
  kind: 'field';
  type: Type;
  required: boolean;
  default?: ForgeFieldDefaultValue;
};

export type ForgeModelFields = Record<string, ForgeFieldDefinition>;

export type ForgeModelFieldMetadata = {
  name: string;
  type: ForgePrimitiveFieldType;
  required: boolean;
  default?: ForgeFieldDefaultValue;
};

export type ForgeModelMetadata = {
  kind: 'model';
  name: string;
  fields: ForgeModelFieldMetadata[];
};

export type ForgeModelDefinition<Fields extends ForgeModelFields = ForgeModelFields> = {
  kind: 'model';
  name: string;
  fields: Fields;
  metadata: ForgeModelMetadata;
};

export function defineModel<Fields extends ForgeModelFields>(
  name: string,
  fields: Fields,
): ForgeModelDefinition<Fields> {
  const metadata: ForgeModelMetadata = {
    kind: 'model',
    name,
    fields: Object.entries(fields).map(([fieldName, fieldDefinition]) => ({
      name: fieldName,
      type: fieldDefinition.type,
      required: fieldDefinition.required,
      ...(fieldDefinition.default !== undefined ? { default: fieldDefinition.default } : {}),
    })),
  };

  return {
    kind: 'model',
    name,
    fields,
    metadata,
  };
}

export const field = {
  string(options?: ForgeFieldOptions): ForgeFieldDefinition<'string'> {
    return createFieldDefinition('string', options);
  },

  text(options?: ForgeFieldOptions): ForgeFieldDefinition<'text'> {
    return createFieldDefinition('text', options);
  },

  boolean(options?: ForgeFieldOptions): ForgeFieldDefinition<'boolean'> {
    return createFieldDefinition('boolean', options);
  },

  integer(options?: ForgeFieldOptions): ForgeFieldDefinition<'integer'> {
    return createFieldDefinition('integer', options);
  },

  decimal(options?: ForgeFieldOptions): ForgeFieldDefinition<'decimal'> {
    return createFieldDefinition('decimal', options);
  },

  date(options?: ForgeFieldOptions): ForgeFieldDefinition<'date'> {
    return createFieldDefinition('date', options);
  },
};

function createFieldDefinition<Type extends ForgePrimitiveFieldType>(
  type: Type,
  options?: ForgeFieldOptions,
): ForgeFieldDefinition<Type> {
  return {
    kind: 'field',
    type,
    required: options?.required ?? false,
    ...(options?.default !== undefined ? { default: options.default } : {}),
  };
}
