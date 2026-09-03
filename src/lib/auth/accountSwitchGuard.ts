export type AccountSwitchIntent = {
  fromTenantId: string | null;
  toTenantId: string;
  toTenantName: string;
};

export type AccountSwitchGuard = (intent: AccountSwitchIntent) => boolean | Promise<boolean>;

const guards = new Set<AccountSwitchGuard>();

export function registerAccountSwitchGuard(guard: AccountSwitchGuard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}

export async function allowAccountSwitch(intent: AccountSwitchIntent): Promise<boolean> {
  for (const guard of Array.from(guards)) {
    if (!await guard(intent)) return false;
  }
  return true;
}
