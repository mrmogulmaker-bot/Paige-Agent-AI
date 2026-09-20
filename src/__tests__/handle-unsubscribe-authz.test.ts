// @vitest-environment node

import { webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

interface PreferenceRow {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  unsubscribed_all: boolean;
  unsubscribed_at: string | null;
  sms_phone_number: string;
}

interface HarnessOptions {
  authUserId?: string | null;
  authError?: boolean;
  preferenceWriteError?: boolean;
  preferenceLostResponse?: boolean;
  preferenceReadbackMismatch?: boolean;
  auditWriteError?: boolean;
  auditLostResponse?: boolean;
}

interface QueryResult {
  data: unknown;
  error: { code: string; message: string } | null;
}

interface QueryState {
  table: string;
  operation?: "select" | "upsert" | "insert" | "update";
  payload?: Record<string, unknown>;
  filters: Record<string, unknown>;
  returning: boolean;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  upsert(payload: Record<string, unknown>, options?: Record<string, unknown>): QueryBuilder;
  insert(payload: Record<string, unknown>): QueryBuilder;
  update(payload: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
}

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const EMAIL_A = "owner-a@example.test";
const EMAIL_B = "owner-b@example.test";
const PHONE_A = "+15550000001";
const PHONE_B = "+15550000002";

function makeHarness(options: HarnessOptions = {}) {
  const authUserId = Object.prototype.hasOwnProperty.call(options, "authUserId")
    ? options.authUserId
    : USER_A;
  const calls: Array<Record<string, unknown>> = [];
  const logs: Array<Record<string, unknown>> = [];
  const suppressions: Array<Record<string, unknown>> = [];
  const preferences = new Map<string, PreferenceRow>([
    [USER_A, {
      user_id: USER_A,
      email_enabled: true,
      sms_enabled: true,
      unsubscribed_all: false,
      unsubscribed_at: null,
      sms_phone_number: PHONE_A,
    }],
    [USER_B, {
      user_id: USER_B,
      email_enabled: true,
      sms_enabled: true,
      unsubscribed_all: false,
      unsubscribed_at: null,
      sms_phone_number: PHONE_B,
    }],
  ]);

  let tokenUsedAt: string | null = null;

  const execute = (state: QueryState): QueryResult => {
    if (state.table === "communication_preferences") {
      if (state.operation === "select") {
        const phone = state.filters.sms_phone_number;
        const row = [...preferences.values()].find((candidate) => candidate.sms_phone_number === phone);
        return { data: row ? { user_id: row.user_id } : null, error: null };
      }

      if (state.operation === "upsert") {
        const userId = String(state.payload?.user_id ?? "");
        calls.push({ kind: "preference_write", user_id: userId, payload: state.payload });
        if (options.preferenceWriteError) {
          return { data: null, error: { code: "XX000", message: "preference write failed" } };
        }
        const current = preferences.get(userId) ?? {
          user_id: userId,
          email_enabled: true,
          sms_enabled: false,
          unsubscribed_all: false,
          unsubscribed_at: null,
          sms_phone_number: "",
        };
        const next = { ...current, ...state.payload, user_id: userId } as PreferenceRow;
        preferences.set(userId, next);
        if (options.preferenceLostResponse) throw new Error("connection lost after preference dispatch");
        const readback = options.preferenceReadbackMismatch
          ? { ...next, email_enabled: true }
          : next;
        return { data: state.returning ? readback : null, error: null };
      }
    }

    if (state.table === "communication_log" && state.operation === "insert") {
      calls.push({ kind: "audit_write", payload: state.payload });
      if (options.auditWriteError) {
        return { data: null, error: { code: "XX001", message: "audit write failed" } };
      }
      logs.push(state.payload ?? {});
      if (options.auditLostResponse) throw new Error("connection lost after audit dispatch");
      return { data: state.returning ? { id: "audit-row-1" } : null, error: null };
    }

    if (state.table === "email_unsubscribe_tokens") {
      if (state.operation === "select") {
        return {
          data: { id: "token-row-1", email: "recipient@example.test", used_at: tokenUsedAt },
          error: null,
        };
      }
      if (state.operation === "update") {
        tokenUsedAt = String(state.payload?.used_at ?? "used");
        return {
          data: state.returning ? { id: "token-row-1", email: "recipient@example.test" } : null,
          error: null,
        };
      }
    }

    if (state.table === "suppressed_emails" && state.operation === "upsert") {
      suppressions.push(state.payload ?? {});
      return { data: null, error: null };
    }

    return { data: null, error: null };
  };

  const query = (table: string): QueryBuilder => {
    const state: QueryState = { table, filters: {}, returning: false };
    const api: QueryBuilder = {
      select() {
        if (!state.operation) state.operation = "select";
        else state.returning = true;
        return api;
      },
      upsert(payload) {
        state.operation = "upsert";
        state.payload = payload;
        return api;
      },
      insert(payload) {
        state.operation = "insert";
        state.payload = payload;
        return api;
      },
      update(payload) {
        state.operation = "update";
        state.payload = payload;
        return api;
      },
      eq(column, value) {
        state.filters[column] = value;
        return api;
      },
      is(column, value) {
        state.filters[column] = value;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(execute(state));
      },
      single() {
        return Promise.resolve(execute(state));
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(execute(state)).then(onFulfilled, onRejected);
      },
    };
    return api;
  };

  return {
    calls,
    logs,
    preferences,
    suppressions,
    createClient(_url: string, key: string, clientOptions?: Record<string, unknown>) {
      if (key === "anon-key") {
        calls.push({ kind: "auth_client", clientOptions });
        return {
          auth: {
            getUser: async () => {
              calls.push({ kind: "auth_check" });
              if (options.authError || !authUserId) {
                return {
                  data: { user: null },
                  error: { code: "bad_jwt", message: "invalid token" },
                };
              }
              return { data: { user: { id: authUserId, email: EMAIL_A } }, error: null };
            },
          },
        };
      }

      calls.push({ kind: "service_client" });
      return {
        auth: {
          admin: {
            listUsers: async () => ({
              data: {
                users: [
                  { id: USER_A, email: EMAIL_A },
                  { id: USER_B, email: EMAIL_B },
                ],
              },
              error: null,
            }),
          },
        },
        from: query,
      };
    },
  };
}

type Harness = ReturnType<typeof makeHarness>;

const setHarness = (harness: Harness) => {
  (globalThis as typeof globalThis & { __handleUnsubscribeHarness: Harness }).__handleUnsubscribeHarness = harness;
};

async function bundleHandler(entry: string, outfile: string) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    plugins: [{
      name: "handle-unsubscribe-supabase-stub",
      setup(builder) {
        builder.onResolve(
          { filter: /^npm:@supabase\/supabase-js@2$/ },
          () => ({ path: "supabase-stub", namespace: "handle-unsubscribe-test" }),
        );
        builder.onLoad(
          { filter: /.*/, namespace: "handle-unsubscribe-test" },
          () => ({
            loader: "js",
            contents: `export const createClient = (...args) => globalThis.__handleUnsubscribeHarness.createClient(...args);`,
          }),
        );
      },
    }],
  });
}

describe("handle-unsubscribe authorization and truthful persistence", () => {
  let targetHandler: EdgeHandler;
  let publicTokenHandler: EdgeHandler;
  let workDir = "";
  const originalDeno = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), "handle-unsubscribe-authz-"));
    const targetBundle = path.join(workDir, "handle-unsubscribe.mjs");
    const publicBundle = path.join(workDir, "handle-email-unsubscribe.mjs");
    await bundleHandler("supabase/functions/handle-unsubscribe/index.ts", targetBundle);
    await bundleHandler("supabase/functions/handle-email-unsubscribe/index.ts", publicBundle);

    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    let captured: EdgeHandler | undefined;
    Object.defineProperty(globalThis, "Deno", {
      configurable: true,
      value: {
        env: {
          get: (key: string) => ({
            SUPABASE_URL: "https://project.supabase.test",
            SUPABASE_ANON_KEY: "anon-key",
            SUPABASE_SERVICE_ROLE_KEY: "service-key",
          })[key],
        },
        serve: (handler: EdgeHandler) => { captured = handler; },
      },
    });

    setHarness(makeHarness());
    await import(`${pathToFileURL(targetBundle).href}?target`);
    if (!captured) throw new Error("handle-unsubscribe did not register a handler");
    targetHandler = captured;

    captured = undefined;
    await import(`${pathToFileURL(publicBundle).href}?public`);
    if (!captured) throw new Error("handle-email-unsubscribe did not register a handler");
    publicTokenHandler = captured;
  });

  afterAll(() => {
    if (originalDeno) Object.defineProperty(globalThis, "Deno", originalDeno);
    else Reflect.deleteProperty(globalThis, "Deno");
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else Reflect.deleteProperty(globalThis, "crypto");
    Reflect.deleteProperty(globalThis, "__handleUnsubscribeHarness");
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  const invokeTarget = async (
    body: Record<string, unknown>,
    options: HarnessOptions = {},
    authorization: string | null = "Bearer valid-user-a-jwt",
  ) => {
    const harness = makeHarness(options);
    setHarness(harness);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (authorization) headers.set("Authorization", authorization);
    const response = await targetHandler(new Request("https://project.supabase.test/functions/v1/handle-unsubscribe", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }));
    return {
      harness,
      response,
      body: await response.json() as Record<string, unknown>,
    };
  };

  it("requires a JWT at both the gateway and handler and performs no unauthenticated write", async () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const functionConfig = config
      .split("[functions.handle-unsubscribe]")[1]
      ?.split(/\n\s*\[functions\./)[0];
    expect(functionConfig).toMatch(/verify_jwt\s*=\s*true/);

    const result = await invokeTarget({ channel: "all", user_id: USER_A }, {}, null);
    expect(result.response.status).toBe(401);
    expect(result.harness.calls.some((call) => call.kind === "service_client")).toBe(false);
    expect(result.harness.calls.some((call) => call.kind === "preference_write")).toBe(false);
    expect(result.harness.preferences.get(USER_A)?.unsubscribed_all).toBe(false);
  });

  it("refuses caller-supplied user_id instead of letting User A select User B", async () => {
    const result = await invokeTarget({ channel: "all", user_id: USER_B });
    expect(result.response.status).toBe(400);
    expect(result.body.error).toBe("identity_selectors_not_allowed");
    expect(result.harness.calls.some((call) => call.kind === "service_client")).toBe(false);
    expect(result.harness.preferences.get(USER_B)?.unsubscribed_all).toBe(false);
  });

  it("refuses caller-supplied email instead of letting User A select User B", async () => {
    const result = await invokeTarget({ channel: "email", email: EMAIL_B });
    expect(result.response.status).toBe(400);
    expect(result.body.error).toBe("identity_selectors_not_allowed");
    expect(result.harness.calls.some((call) => call.kind === "service_client")).toBe(false);
    expect(result.harness.preferences.get(USER_B)?.email_enabled).toBe(true);
  });

  it("refuses caller-supplied phone instead of letting User A select User B", async () => {
    const result = await invokeTarget({ channel: "sms", phone: PHONE_B });
    expect(result.response.status).toBe(400);
    expect(result.body.error).toBe("identity_selectors_not_allowed");
    expect(result.harness.calls.some((call) => call.kind === "service_client")).toBe(false);
    expect(result.harness.preferences.get(USER_B)?.sms_enabled).toBe(true);
  });

  it("derives the authenticated caller and completes self-unsubscribe", async () => {
    const result = await invokeTarget({ channel: "email" });
    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      outcome: "unsubscribed",
      channel: "email",
      preference_updated: true,
      audit_logged: true,
    });
    expect(result.harness.calls.find((call) => call.kind === "preference_write")?.user_id).toBe(USER_A);
    expect(result.harness.logs).toHaveLength(1);
    expect(result.harness.logs[0].user_id).toBe(USER_A);
  });

  it("email-only self-unsubscribe changes only email", async () => {
    const result = await invokeTarget({ channel: "email" });
    expect(result.harness.preferences.get(USER_A)).toMatchObject({
      email_enabled: false,
      sms_enabled: true,
      unsubscribed_all: false,
      unsubscribed_at: null,
    });
    expect(result.harness.preferences.get(USER_B)?.email_enabled).toBe(true);
  });

  it("SMS-only self-unsubscribe changes only SMS", async () => {
    const result = await invokeTarget({ channel: "sms" });
    expect(result.harness.preferences.get(USER_A)).toMatchObject({
      email_enabled: true,
      sms_enabled: false,
      unsubscribed_all: false,
      unsubscribed_at: null,
    });
    expect(result.harness.preferences.get(USER_B)?.sms_enabled).toBe(true);
  });

  it("all-channel self-unsubscribe records the complete state", async () => {
    const result = await invokeTarget({ channel: "all" });
    expect(result.harness.preferences.get(USER_A)).toMatchObject({
      email_enabled: false,
      sms_enabled: false,
      unsubscribed_all: true,
    });
    expect(result.harness.preferences.get(USER_A)?.unsubscribed_at).toEqual(expect.any(String));
    expect(result.harness.preferences.get(USER_B)?.unsubscribed_all).toBe(false);
  });

  it("does not report success when the compliance-critical preference write fails", async () => {
    const result = await invokeTarget({ channel: "email" }, { preferenceWriteError: true });
    expect(result.response.status).toBe(500);
    expect(result.body).toMatchObject({
      success: false,
      outcome: "not_unsubscribed",
      error: "preference_write_failed",
      preference_updated: false,
      audit_logged: false,
    });
    expect(result.harness.preferences.get(USER_A)?.email_enabled).toBe(true);
    expect(result.harness.logs).toHaveLength(0);
  });

  it("reports an unknown preference outcome when the response is lost after dispatch", async () => {
    const result = await invokeTarget({ channel: "email" }, { preferenceLostResponse: true });
    expect(result.response.status).toBe(500);
    expect(result.body).toMatchObject({
      success: false,
      outcome: "preference_outcome_unknown",
      error: "preference_write_outcome_unknown",
      preference_updated: "unknown",
      audit_logged: false,
    });
    expect(result.harness.preferences.get(USER_A)?.email_enabled).toBe(false);
    expect(result.harness.logs).toHaveLength(0);
  });

  it("does not claim a definite preference outcome when canonical readback mismatches", async () => {
    const result = await invokeTarget({ channel: "email" }, { preferenceReadbackMismatch: true });
    expect(result.response.status).toBe(500);
    expect(result.body).toMatchObject({
      success: false,
      outcome: "preference_outcome_unknown",
      error: "preference_readback_failed",
      preference_updated: "unknown",
      audit_logged: false,
    });
    expect(result.harness.logs).toHaveLength(0);
  });

  it("reports an explicit partial outcome when preferences land but audit logging fails", async () => {
    const result = await invokeTarget({ channel: "email" }, { auditWriteError: true });
    expect(result.response.status).toBe(500);
    expect(result.body).toMatchObject({
      success: false,
      outcome: "unsubscribed_audit_failed",
      error: "audit_log_write_failed",
      preference_updated: true,
      audit_logged: false,
    });
    expect(result.harness.preferences.get(USER_A)?.email_enabled).toBe(false);
  });

  it("reports an unknown audit outcome when its response is lost after suppression", async () => {
    const result = await invokeTarget({ channel: "email" }, { auditLostResponse: true });
    expect(result.response.status).toBe(500);
    expect(result.body).toMatchObject({
      success: false,
      outcome: "unsubscribed_audit_outcome_unknown",
      error: "audit_log_outcome_unknown",
      preference_updated: true,
      audit_logged: "unknown",
    });
    expect(result.harness.preferences.get(USER_A)?.email_enabled).toBe(false);
    expect(result.harness.logs).toHaveLength(1);
  });

  it("keeps the existing public tokenized email-unsubscribe endpoint operational", async () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(/\[functions\.handle-email-unsubscribe\]\s+verify_jwt = false/);
    expect(config).toMatch(/\[functions\.comms-email-unsubscribe\]\s+verify_jwt = false/);

    const harness = makeHarness();
    setHarness(harness);
    const response = await publicTokenHandler(new Request(
      "https://project.supabase.test/functions/v1/handle-email-unsubscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "public-high-entropy-token" }),
      },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(harness.suppressions).toEqual([{
      email: "recipient@example.test",
      reason: "unsubscribe",
    }]);
  });

  it("establishes caller authority before creating or using the service-role client", async () => {
    const invalid = await invokeTarget({ channel: "email" }, { authUserId: null }, "Bearer invalid-jwt");
    expect(invalid.response.status).toBe(401);
    expect(invalid.harness.calls.map((call) => call.kind)).toEqual(["auth_client", "auth_check"]);

    const valid = await invokeTarget({ channel: "email" });
    const order = valid.harness.calls.map((call) => call.kind);
    expect(order.indexOf("auth_check")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("service_client")).toBeGreaterThan(order.indexOf("auth_check"));
    expect(order.indexOf("preference_write")).toBeGreaterThan(order.indexOf("service_client"));
  });
});
