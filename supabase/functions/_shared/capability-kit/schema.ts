export type StringInputSchema = Readonly<{
  type: "string";
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: "email" | "uuid";
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
const SUPPORTED_STRING_FORMATS = new Set(["email", "uuid"]);

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

function assertOptionalString(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
}

function assertRequiredKeys(
  value: unknown,
  properties: Record<PropertyKey, unknown>,
  label: string,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} must contain only strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique property names.`);
  }
  for (const key of value) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      throw new TypeError(`${label} names an undeclared property: ${key}.`);
    }
  }
  return value;
}

function assertSafeProperties(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object.`);
  for (const key of Object.keys(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new TypeError(`${label} contains an unsafe property name: ${key}.`);
    }
  }
}

function assertStringEnum(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be a non-empty array containing only strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain unique strings.`);
  }
}

function assertPattern(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  try {
    // Supported dialect: JavaScript/ECMAScript RegExp pattern syntax, with no flags.
    new RegExp(value);
  } catch {
    throw new TypeError(`${label} must compile as an ECMAScript RegExp without flags.`);
  }
}

function assertFormat(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !SUPPORTED_STRING_FORMATS.has(value)) {
    throw new TypeError(`${label} must be one of: ${[...SUPPORTED_STRING_FORMATS].join(", ")}.`);
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
    assertOptionalString(schema.description, `${label}.description`);
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
      throw new TypeError(`${label}.anyOf must be a non-empty array.`);
    }
    schema.anyOf.forEach((member, index) => assertNestedSchema(member, `${label}.anyOf[${index}]`));
    return;
  }

  switch (schema.type) {
    case "string":
      assertExactKeys(schema, ["type", "description", "enum", "minLength", "maxLength", "pattern", "format"], label);
      assertOptionalString(schema.description, `${label}.description`);
      assertStringEnum(schema.enum, `${label}.enum`);
      assertOptionalNonNegativeInteger(schema.minLength, `${label}.minLength`);
      assertOptionalNonNegativeInteger(schema.maxLength, `${label}.maxLength`);
      if (schema.minLength !== undefined && schema.maxLength !== undefined && Number(schema.maxLength) < Number(schema.minLength)) {
        throw new TypeError(`${label}.maxLength must be greater than or equal to minLength.`);
      }
      assertPattern(schema.pattern, `${label}.pattern`);
      assertFormat(schema.format, `${label}.format`);
      return;
    case "number":
    case "integer":
      assertExactKeys(schema, ["type", "description", "minimum", "maximum"], label);
      assertOptionalString(schema.description, `${label}.description`);
      assertOptionalFiniteNumber(schema.minimum, `${label}.minimum`);
      assertOptionalFiniteNumber(schema.maximum, `${label}.maximum`);
      if (schema.minimum !== undefined && schema.maximum !== undefined && Number(schema.maximum) < Number(schema.minimum)) {
        throw new TypeError(`${label}.maximum must be greater than or equal to minimum.`);
      }
      return;
    case "boolean":
      assertExactKeys(schema, ["type", "description"], label);
      assertOptionalString(schema.description, `${label}.description`);
      return;
    case "null":
      assertExactKeys(schema, ["type"], label);
      return;
    case "array":
      assertExactKeys(schema, ["type", "description", "items", "minItems", "maxItems"], label);
      assertOptionalString(schema.description, `${label}.description`);
      assertOptionalNonNegativeInteger(schema.minItems, `${label}.minItems`);
      assertOptionalNonNegativeInteger(schema.maxItems, `${label}.maxItems`);
      if (schema.minItems !== undefined && schema.maxItems !== undefined && Number(schema.maxItems) < Number(schema.minItems)) {
        throw new TypeError(`${label}.maxItems must be greater than or equal to minItems.`);
      }
      assertNestedSchema(schema.items, `${label}.items`);
      return;
    case "object": {
      assertExactKeys(schema, ["type", "description", "properties", "required", "additionalProperties"], label);
      assertOptionalString(schema.description, `${label}.description`);
      assertSafeProperties(schema.properties, `${label}.properties`);
      if (schema.additionalProperties !== false) {
        throw new TypeError(`${label}.additionalProperties must be false.`);
      }
      assertRequiredKeys(schema.required, schema.properties, `${label}.required`);
      for (const [key, child] of Object.entries(schema.properties)) {
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

  assertExactKeys(definition, ["description", "properties", "required"], "capability input root");
  assertOptionalString(definition.description, "Capability input schema description");
  assertSafeProperties(definition.properties, "Capability input schema properties");

  for (const [key, child] of Object.entries(definition.properties)) {
    assertNestedSchema(child, `Capability input property ${key}`);
  }

  const required = [...assertRequiredKeys(
    definition.required,
    definition.properties,
    "Capability input schema required",
  )];

  const schema = {
    type: "object" as const,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
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
