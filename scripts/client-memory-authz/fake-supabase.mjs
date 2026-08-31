/**
 * A RECORDING fake `@supabase/supabase-js` client.
 *
 * It exists to answer exactly one question the real code cannot be asked any other
 * way without a live database: **which tenant id does `paige-ai-chat` pass to
 * `match_tenant_knowledge`, for a given caller shape?**
 *
 * Design rules (§13):
 *   • It RECORDS rather than asserts. The checks own every assertion, so a fake that
 *     drifts cannot quietly satisfy one.
 *   • `tableErrors: { <table>: {message,code} }` injects a READ FAILURE. Without it the
 *     `if (error)` branches in the handler are unreachable by this harness, so a fail-closed
 *     path that only fires on a read error cannot be witnessed at all.
 *   • Unconfigured reads resolve to `{ data: [], error: null }` — an empty result, never
 *     an invented row. The handler's own try/catch then degrades exactly as in production.
 *   • `rpc()` results are configured PER SCENARIO, including error results, so a check can
 *     drive the real `KB_FORBIDDEN` rejection path instead of describing it.
 *
 * It is a test double for the module boundary only. No production code imports it.
 */

/** One recorded call, in order. */
function mkRecorder() {
  return { rpc: [], from: [], inserts: [] };
}

class QueryBuilder {
  constructor(table, scenario, recorder, kind) {
    this._table = table;
    // WHICH CLIENT asked. Without this the recorder captured table/op/filters only, so a check
    // could assert the SHAPE of an authorization query but never its AUTHORITY — and swapping
    // the JWT client for the service-role one (the single token that reinstates the original
    // vulnerability) left the whole suite green. Recording the caller is what makes the one
    // property this fix depends on witnessable at all.
    this._kind = kind;
    this._scenario = scenario;
    this._recorder = recorder;
    this._filters = [];
    this._ordered = false;
    this._limit = null;
    this._op = "select";
  }

  // Every filter/shape method records itself and chains. Recording the SHAPE (not just
  // the table) is what lets a check prove an unordered LIMIT 1 pick is gone.
  select(...a) { this._filters.push(["select", a[0]]); return this; }
  insert(row) { this._op = "insert"; this._recorder.inserts.push({ table: this._table, row }); return this; }
  update(row) { this._op = "update"; this._recorder.inserts.push({ table: this._table, row, update: true }); return this; }
  upsert(row) { this._op = "upsert"; this._recorder.inserts.push({ table: this._table, row, upsert: true }); return this; }
  delete() { this._op = "delete"; return this; }
  eq(c, v) { this._filters.push(["eq", c, v]); return this; }
  neq(c, v) { this._filters.push(["neq", c, v]); return this; }
  in(c, v) { this._filters.push(["in", c, v]); return this; }
  is(c, v) { this._filters.push(["is", c, v]); return this; }
  not(...a) { this._filters.push(["not", ...a]); return this; }
  or(v) { this._filters.push(["or", v]); return this; }
  gte(c, v) { this._filters.push(["gte", c, v]); return this; }
  lte(c, v) { this._filters.push(["lte", c, v]); return this; }
  gt(c, v) { this._filters.push(["gt", c, v]); return this; }
  lt(c, v) { this._filters.push(["lt", c, v]); return this; }
  like(c, v) { this._filters.push(["like", c, v]); return this; }
  ilike(c, v) { this._filters.push(["ilike", c, v]); return this; }
  contains(c, v) { this._filters.push(["contains", c, v]); return this; }
  textSearch(c, v) { this._filters.push(["textSearch", c, v]); return this; }
  order(c, o) { this._ordered = true; this._filters.push(["order", c, o]); return this; }
  range(a, b) { this._filters.push(["range", a, b]); return this; }
  limit(n) { this._limit = n; this._filters.push(["limit", n]); return this; }

  _rows() {
    const svc = this._scenario.serviceTables?.[this._table];
    if (this._kind === "service" && svc !== undefined) {
      return (typeof svc === "function" ? svc(this._filters) : svc) ?? [];
    }
    const fn = this._scenario.tables?.[this._table];
    if (typeof fn === "function") return fn(this._filters) ?? [];
    if (Array.isArray(fn)) return fn;
    return [];
  }

  _record(single) {
    this._recorder.from.push({
      client: this._kind,
      table: this._table,
      op: this._op,
      filters: this._filters,
      ordered: this._ordered,
      limit: this._limit,
      single,
    });
  }

  maybeSingle() {
    this._record(true);
    const rows = this._rows();
    const injected = this._scenario.tableErrors?.[this._table];
    if (injected) return Promise.resolve({ data: null, error: injected });
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  single() { return this.maybeSingle(); }

  then(res, rej) {
    this._record(false);
    const injectedThen = this._scenario.tableErrors?.[this._table];
    if (injectedThen) return Promise.resolve({ data: null, error: injectedThen, count: 0 }).then(res, rej);
    return Promise.resolve({ data: this._rows(), error: null, count: this._rows().length }).then(res, rej);
  }
}

class FakeClient {
  constructor(kind, scenario, recorder) {
    this._kind = kind; // "jwt" | "service"
    this._scenario = scenario;
    this._recorder = recorder;
    this.auth = {
      getUser: async () => scenario.authUser
        ? { data: { user: scenario.authUser }, error: null }
        : { data: { user: null }, error: { message: "no user" } },
      getClaims: async () => ({ data: { claims: { sub: scenario.authUser?.id ?? null } }, error: null }),
    };
    this.storage = { from: () => ({ upload: async () => ({ data: null, error: null }), createSignedUrl: async () => ({ data: null, error: null }), download: async () => ({ data: null, error: null }) }) };
    this.functions = { invoke: async () => ({ data: null, error: null }) };
    this.channel = () => ({ send: async () => {}, subscribe: () => ({}), on: function () { return this; } });
    this.removeChannel = () => {};
  }

  from(table) { return new QueryBuilder(table, this._scenario, this._recorder, this._kind); }

  async rpc(name, args) {
    this._recorder.rpc.push({ client: this._kind, name, args });
    const configured = this._scenario.rpcs?.[name];
    // A scenario value is ALWAYS the full PostgREST result — `{ data, error }` — or a
    // function returning one. Never a bare payload that this fake then wraps: wrapping
    // silently produced `{ data: { data: … } }`, which the handler read as null and which
    // made a real assertion look like a code defect. Be strict rather than convenient (§13).
    const result = typeof configured === "function" ? configured(args) : configured;
    if (result === undefined) return { data: null, error: null };
    if (result === null || typeof result !== "object" || !("data" in result || "error" in result)) {
      throw new Error(
        `fake-supabase: scenario rpc "${name}" must return { data, error }; got ${JSON.stringify(result)}`,
      );
    }
    return result;
  }
}

/** Set before importing the module under test; consumed by `createClient`. */
let ACTIVE = { scenario: {}, recorder: mkRecorder() };

export function setScenario(scenario) {
  ACTIVE = { scenario, recorder: mkRecorder() };
  return ACTIVE.recorder;
}
export function recorder() { return ACTIVE.recorder; }

export function createClient(_url, key, _opts) {
  // The handler builds the JWT client with the ANON key and the service client with the
  // SERVICE_ROLE key. Distinguishing them lets a check prove which client asked what.
  const kind = String(key ?? "").includes("service") ? "service" : "jwt";
  return new FakeClient(kind, ACTIVE.scenario, ACTIVE.recorder);
}

export default { createClient };
