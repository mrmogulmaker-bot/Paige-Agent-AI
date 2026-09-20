export type StringInputSchema = Readonly<{
  type: "string";
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}>;

export type NumberInputSchema = Readonly<{
  type: "number" | "integer";
  description?: string;
  minimum?: number;
  maximum?: number;
}>;

export type BooleanInputSchema = Readonly<{
  type: "boolean";
  description?: string;
}>;

export type NullInputSchema = Readonly<{ type: "null" }>;

export type NestedInputSchema =
  | StringInputSchema
  | NumberInputSchema
  | BooleanInputSchema
  | NullInputSchema
  | Readonly<{
      type: "array";
      description?: string;
      items: NestedInputSchema;
      minItems?: number;
      maxItems?: number;
    }>
  | Readonly<{
      type: "object";
      description?: string;
      properties: Readonly<Record<string, NestedInputSchema>>;
      required?: readonly string[];
      additionalProperties: false;
    }>
  | Readonly<{
      description?: string;
      anyOf: readonly NestedInputSchema[];
    }>;

const CAPABILITY_INPUT_SCHEMA = Symbol("paige.capability-input-schema");
const CAPABILITY_INPUT_SCHEMAS = new WeakSet<object>();

export type CapabilityInputSchema = Readonly<{
  type: "object";
  description?: string;
  properties: Readonly<Record<string, NestedInputSchema>>;
  required: readonly string[];
  additionalProperties: false;
  readonly [CAPABILITY_INPUT_SCHEMA]: true;
}>;

type ObjectInputDefinition<
  Properties extends Readonly<Record<string, NestedInputSchema>>,
  Required extends readonly (Extract<keyof Properties, string>)[],
> = Readonly<{
  description?: string;
  properties: Properties;
  required?: Required;
}>;

const ROOT_COMBINATORS = ["anyOf", "oneOf", "allOf", "not"] as const;

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function assertOptionalNonNegativeInteger(value: unknown, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || !Number.isInteger(value) || Number(value) < 0)) {
    throw new TypeError(`${label} must be a finite non-negative integer.`);
  }
}

function assertOptionalFiniteNumber(value: unknown, label: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function assertExactKeys(value: Record<PropertyKey, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`Unsupported ${label} key: ${key}.`);
  }
}

function assertNestedSchema(value: unknown, label: string): void {
  const schema = isPlainObject(value) ? value : null;
  if (!schema) throw new TypeError(`${label} must be a plain object.`);
  for (const keyword of ["oneOf", "allOf", "not"] as const) {
    if (keyword in schema) throw new TypeError(`${label} cannot declare ${keyword}.`);
  }
  if ("anyOf" in schema) {
    assertExactKeys(schema, ["description", "anyOf"], label);
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
      throw new TypeError(`${label}.anyOf must be a non-empty array.`);
    }
    schema.anyOf.forEach((member, index) => assertNestedSchema(member, `${label}.anyOf[${index}]`));
    return;
  }

  switch (schema.type) {
    case "string":
      assertExactKeys(schema, ["type", "description", "enum", "minLength", "maxLength", "pattern", "format"], label);
      if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.some((item) => typeof item !== "string"))) {
        throw new TypeError(`${label}.enum must contain only strings.`);
      }
      assertOptionalNonNegativeInteger(schema.minLength, `${label}.minLength`);
      assertOptionalNonNegativeInteger(schema.maxLength, `${label}.maxLength`);
      if (schema.minLength !== undefined && schema.maxLength !== undefined && Number(schema.maxLength) < Number(schema.minLength)) {
        throw new TypeError(`${label}.maxLength must be greater than or equal to minLength.`);
      }
      return;
    case "number":
    case "integer":
      assertExactKeys(schema, ["type", "description", "minimum", "maximum"], label);
      assertOptionalFiniteNumber(schema.minimum, `${label}.minimum`);
      assertOptionalFiniteNumber(schema.maximum, `${label}.maximum`);
      if (schema.minimum !== undefined && schema.maximum !== undefined && Number(schema.maximum) < Number(schema.minimum)) {
        throw new TypeError(`${label}.maximum must be greater than or equal to minimum.`);
      }
      return;
    case "boolean":
      assertExactKeys(schema, ["type", "description"], label);
      return;
    case "null":
      assertExactKeys(schema, ["type"], label);
      return;
    case "array":
      assertExactKeys(schema, ["type", "description", "items", "minItems", "maxItems"], label);
      assertOptionalNonNegativeInteger(schema.minItems, `${label}.minItems`);
      assertOptionalNonNegativeInteger(schema.maxItems, `${label}.maxItems`);
      if (schema.minItems !== undefined && schema.maxItems !== undefined && Number(schema.maxItems) < Number(schema.minItems)) {
        throw new TypeError(`${label}.maxItems must be greater than or equal to minItems.`);
      }
      assertNestedSchema(schema.items, `${label}.items`);
      return;
    case "object": {
      assertExactKeys(schema, ["type", "description", "properties", "required", "additionalProperties"], label);
      if (!isPlainObject(schema.properties) || schema.additionalProperties !== false) {
        throw new TypeError(`${label} must declare plain properties and additionalProperties: false.`);
      }
      const required = schema.required ?? [];
      if (!Array.isArray(required) || required.some((key) => typeof key !== "string")) {
        throw new TypeError(`${label}.required must contain only strings.`);
      }
      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          throw new TypeError(`${label}.required names an undeclared property: ${key}.`);
        }
      }
      for (const [key, child] of Object.entries(schema.properties)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) {
          throw new TypeError(`${label} contains an unsafe property name.`);
        }
        assertNestedSchema(child, `${label}.properties.${key}`);
      }
      return;
    }
    default:
      throw new TypeError(`${label}.type is not in the provider-safe schema subset.`);
  }
}

export function objectInputSchema<
  const Properties extends Readonly<Record<string, NestedInputSchema>>,
  const Required extends readonly (Extract<keyof Properties, string>)[] = readonly [],
>(definition: ObjectInputDefinition<Properties, Required>): CapabilityInputSchema {
  if (!isPlainObject(definition)) {
    throw new TypeError("Capability input schema roots must be plain objects.");
  }

  for (const keyword of ROOT_COMBINATORS) {
    if (Object.prototype.hasOwnProperty.call(definition, keyword)) {
      throw new TypeError(`Capability input schema roots cannot declare ${keyword}.`);
    }
  }

  const allowed = new Set(["description", "properties", "required"]);
  for (const key of Object.keys(definition)) {
    if (!allowed.has(key)) throw new TypeError(`Unsupported capability input root key: ${key}.`);
  }
  if (!isPlainObject(definition.properties)) {
    throw new TypeError("Capability input schema properties must be a plain object.");
  }

  for (const [key, child] of Object.entries(definition.properties)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new TypeError("Capability input schema contains an unsafe property name.");
    }
    assertNestedSchema(child, `Capability input property ${key}`);
  }

  const required = definition.required ? [...definition.required] : [];
  if (new Set(required).size !== required.length) {
    throw new TypeError("Capability input schema required keys must be unique.");
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(definition.properties, key)) {
      throw new TypeError(`Required input key is not declared in properties: ${key}.`);
    }
  }

  const schema = {
    type: "object" as const,
    ...(definition.description ? { description: definition.description } : {}),
    properties: { ...definition.properties },
    required,
    additionalProperties: false as const,
  } as unknown as CapabilityInputSchema;
  Object.defineProperty(schema, CAPABILITY_INPUT_SCHEMA, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  const frozen = freezeDeep(schema);
  CAPABILITY_INPUT_SCHEMAS.add(frozen);
  return frozen;
}

export function isCapabilityInputSchema(value: unknown): value is CapabilityInputSchema {
  if (!isPlainObject(value)) return false;
  if (value[CAPABILITY_INPUT_SCHEMA] !== true || !CAPABILITY_INPUT_SCHEMAS.has(value) || value.type !== "object") return false;
  if (value.additionalProperties !== false || !isPlainObject(value.properties)) return false;
  if (!Array.isArray(value.required) || !Object.isFrozen(value)) return false;
  return ROOT_COMBINATORS.every((keyword) => !(keyword in value));
}
