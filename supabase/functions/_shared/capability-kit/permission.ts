import { snapshotPlainData } from "./snapshot.ts";

declare const ownerGrantablePermissionBrand: unique symbol;
const OWNER_GRANTABLE_PERMISSIONS = new WeakSet<object>();

export type OwnerGrantablePermissionKey = Readonly<{
  key: string;
  readonly [ownerGrantablePermissionBrand]: true;
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

  const permission = { key: normalized } as OwnerGrantablePermissionKey;

  Object.freeze(permission);
  OWNER_GRANTABLE_PERMISSIONS.add(permission);
  return permission;
}

export function isOwnerGrantablePermissionKey(
  value: unknown,
): value is OwnerGrantablePermissionKey {
  if (!value || typeof value !== "object" || !OWNER_GRANTABLE_PERMISSIONS.has(value)) return false;
  return Object.isFrozen(value);
}

export function snapshotOwnerGrantablePermission(
  value: unknown,
): OwnerGrantablePermissionKey {
  if (!isOwnerGrantablePermissionKey(value)) {
    throw new TypeError("requiredPermission must come from ownerGrantablePermission().");
  }
  const snapshot = snapshotPlainData(value, "Owner-grantable permission") as Record<string, unknown>;
  if (Object.keys(snapshot).length !== 1 || typeof snapshot.key !== "string") {
    throw new TypeError("Owner-grantable permissions must contain only their key.");
  }
  return ownerGrantablePermission(snapshot.key);
}
