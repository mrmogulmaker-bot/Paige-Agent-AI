const OWNER_GRANTABLE_PERMISSION = Symbol("paige.owner-grantable-permission");
const OWNER_GRANTABLE_PERMISSIONS = new WeakSet<object>();

export type OwnerGrantablePermissionKey = Readonly<{
  key: string;
  readonly [OWNER_GRANTABLE_PERMISSION]: true;
}>;

const ROLE_LITERALS = new Set([
  "owner",
  "admin",
  "coach",
  "member",
  "platform_operator",
]);

const PERMISSION_KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){2,}$/;

export function ownerGrantablePermission(key: string): OwnerGrantablePermissionKey {
  const normalized = key.trim().toLowerCase();
  if (key !== normalized) {
    throw new TypeError("Owner-grantable permission keys must already be canonical lowercase values.");
  }
  if (!PERMISSION_KEY.test(normalized)) {
    throw new TypeError(
      "Owner-grantable permissions must be stable capability keys with at least three segments.",
    );
  }
  if (ROLE_LITERALS.has(normalized) || /^(?:role|roles)[._-]/.test(normalized)) {
    throw new TypeError("Role-name literals are not owner-grantable capability permissions.");
  }
  if (/^marketplace[._-](?:listing|installed|installation)[._-]/.test(normalized)) {
    throw new TypeError("Marketplace listing or installation state is not authority.");
  }

  const permission = Object.freeze({
    key: normalized,
    [OWNER_GRANTABLE_PERMISSION]: true as const,
  });
  OWNER_GRANTABLE_PERMISSIONS.add(permission);
  return permission;
}

export function isOwnerGrantablePermissionKey(
  value: unknown,
): value is OwnerGrantablePermissionKey {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<PropertyKey, unknown>)[OWNER_GRANTABLE_PERMISSION] === true &&
      OWNER_GRANTABLE_PERMISSIONS.has(value as object) &&
      Object.isFrozen(value),
  );
}
