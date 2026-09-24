// A chainable PostgREST-shaped fake. Every call is recorded so a check can assert on
// what the handler DID, not only on what it returned — the point of these checks is
// that a refused request writes nothing.
//
// `routes` maps a table name to a function (op, state) => { data, error }. An
// unmapped table returns { data: null, error: null }, which is the honest PostgREST
// shape for "no row", and is recorded either way.

export function makeFakeSupabase({ routes = {}, user = null } = {}) {
  const calls = [];

  function builder(table) {
    const state = { table, op: null, payload: null, filters: [], single: false };
    const record = () => calls.push({ ...state, filters: [...state.filters] });

    const settle = () => {
      record();
      const route = routes[table];
      const res = route ? route(state.op, state) : { data: null, error: null };
      return Promise.resolve(res ?? { data: null, error: null });
    };

    const api = {
      select(cols) { state.op ??= "select"; state.cols = cols; return api; },
      insert(payload) { state.op = "insert"; state.payload = payload; return api; },
      update(payload) { state.op = "update"; state.payload = payload; return api; },
      upsert(payload) { state.op = "upsert"; state.payload = payload; return api; },
      delete() { state.op = "delete"; return api; },
      eq(c, v) { state.filters.push(["eq", c, v]); return api; },
      neq(c, v) { state.filters.push(["neq", c, v]); return api; },
      is(c, v) { state.filters.push(["is", c, v]); return api; },
      ilike(c, v) { state.filters.push(["ilike", c, v]); return api; },
      in(c, v) { state.filters.push(["in", c, v]); return api; },
      order() { return api; },
      limit(n) { state.limit = n; return api; },
      maybeSingle() { state.single = true; return settle(); },
      single() { state.single = true; return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return api;
  }

  return {
    __calls: calls,
    from: (table) => builder(table),
    rpc: (fn, args) => {
      calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args, filters: [] });
      const route = routes[`rpc:${fn}`];
      return Promise.resolve(route ? route("rpc", { payload: args }) : { data: null, error: null });
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
      admin: { listUsers: () => Promise.resolve({ data: { users: [] }, error: null }) },
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
}

/** Rows written to a table by this run — the "did it persist anything?" assertion. */
export function writesTo(fake, table) {
  return fake.__calls.filter(
    (c) => c.table === table && (c.op === "insert" || c.op === "update" || c.op === "upsert"),
  );
}
