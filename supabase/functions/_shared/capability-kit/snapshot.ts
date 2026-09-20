import { types } from "node:util";

export type SnapshotReplacement = Readonly<{ value: unknown }>;
export type SnapshotReplacer = (value: object, path: string) => SnapshotReplacement | undefined;

function isPlainPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null || Array.isArray(value);
}

/**
 * Copies only own enumerable data properties into fresh plain objects/arrays.
 * Accessors, Proxies, functions, symbols, cycles, and non-plain prototypes are
 * rejected before a declaration can be validated or branded.
 */
export function snapshotPlainData<T>(value: T, label: string, replace?: SnapshotReplacer): T {
  const active = new WeakSet<object>();

  function copy(current: unknown, path: string): unknown {
    if (typeof current === "function" || typeof current === "symbol") {
      throw new TypeError(`${path} cannot contain functions or symbols.`);
    }
    if (current === null || typeof current !== "object") return current;
    if (types.isProxy(current)) throw new TypeError(`${path} cannot be a Proxy.`);
    if (!isPlainPrototype(current)) throw new TypeError(`${path} must use a plain prototype.`);

    const replacement = replace?.(current, path);
    if (replacement) return replacement.value;
    if (active.has(current)) throw new TypeError(`${path} cannot contain cycles.`);
    active.add(current);

    const descriptors = Object.getOwnPropertyDescriptors(current) as Record<PropertyKey, PropertyDescriptor>;
    const target: unknown[] | Record<string, unknown> = Array.isArray(current) ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (descriptor.get || descriptor.set) throw new TypeError(`${path} cannot contain accessors.`);
      if (typeof key === "symbol") throw new TypeError(`${path} cannot contain symbol properties.`);
      if (!descriptor.enumerable) continue;
      if (Array.isArray(current) && !/^(?:0|[1-9]\d*)$/.test(key)) {
        throw new TypeError(`${path} arrays cannot contain named properties.`);
      }
      Object.defineProperty(target, key, {
        value: copy(descriptor.value, `${path}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    active.delete(current);
    return target;
  }

  return copy(value, label) as T;
}
