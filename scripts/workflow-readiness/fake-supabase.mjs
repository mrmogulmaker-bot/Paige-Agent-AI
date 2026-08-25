// Minimal chainable PostgREST-shaped fake. Records every query so a check can
// assert WHICH filters a handler applied — the tenant scope and the claim CAS
// are filters, so asserting on them is asserting on the security property.
export function makeFakeSupabase(handlers = {}) {
  const queries = [];
  const rpcCalls = [];

  function builder(table, op) {
    const q = { table, op, filters: [], payload: undefined, _limit: null };
    queries.push(q);
    const chain = {
      select(cols) { q.select = cols; return chain; },
      insert(p) { q.op = "insert"; q.payload = p; return chain; },
      update(p) { q.op = "update"; q.payload = p; return chain; },
      eq(c, v) { q.filters.push(["eq", c, v]); return chain; },
      neq(c, v) { q.filters.push(["neq", c, v]); return chain; },
      lt(c, v) { q.filters.push(["lt", c, v]); return chain; },
      gte(c, v) { q.filters.push(["gte", c, v]); return chain; },
      is(c, v) { q.filters.push(["is", c, v]); return chain; },
      in(c, v) { q.filters.push(["in", c, v]); return chain; },
      order() { return chain; },
      limit(n) { q._limit = n; return chain; },
      maybeSingle() { return resolve(q, "maybeSingle"); },
      single() { return resolve(q, "single"); },
      then(res, rej) { return resolve(q, "many").then(res, rej); },
    };
    return chain;
  }

  async function resolve(q, shape) {
    const h = handlers[`${q.op}:${q.table}`] ?? handlers[q.table];
    const out = typeof h === "function" ? await h(q, shape) : (h ?? { data: null, error: null });
    return { data: out.data ?? null, error: out.error ?? null };
  }

  return {
    __queries: queries,
    __rpcCalls: rpcCalls,
    from(table) { return builder(table, "select"); },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      const h = handlers[`rpc:${name}`];
      const out = typeof h === "function" ? await h(args) : (h ?? { data: null, error: null });
      return { data: out.data ?? null, error: out.error ?? null };
    },
    auth: {
      getUser: async () => ({ data: { user: handlers.__user ?? null }, error: null }),
    },
  };
}
