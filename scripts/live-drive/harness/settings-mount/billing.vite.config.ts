/** Isolated Billing adapter; other Settings/Connections harnesses retain their own transport. */
import path from "node:path";
import base from "./vite.config";
export default {
  ...base,
  resolve: {
    ...base.resolve,
    alias: (base.resolve?.alias as Array<{ find: string | RegExp; replacement: string }>).map((alias) =>
      String(alias.find).includes("supabase") ? { ...alias, replacement: path.join(import.meta.dirname, "billing-supabase-stub.ts") } : alias),
  },
};
