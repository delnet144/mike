// Single-player local-only stub: replaces real Supabase client
// so the frontend module graph doesn't crash on missing env vars.

const dummyChain: any = {
  select: () => dummyChain,
  insert: () => dummyChain,
  upsert: () => dummyChain,
  update: () => dummyChain,
  delete: () => dummyChain,
  eq: () => dummyChain,
  neq: () => dummyChain,
  gt: () => dummyChain,
  gte: () => dummyChain,
  lt: () => dummyChain,
  lte: () => dummyChain,
  is: () => dummyChain,
  in: () => dummyChain,
  contains: () => dummyChain,
  containedBy: () => dummyChain,
  range: () => dummyChain,
  overlaps: () => dummyChain,
  textSearch: () => dummyChain,
  match: () => dummyChain,
  not: () => dummyChain,
  or: () => dummyChain,
  and: () => dummyChain,
  filter: () => dummyChain,
  order: () => dummyChain,
  limit: () => dummyChain,
  rangeLt: () => dummyChain,
  rangeGt: () => dummyChain,
  rangeGte: () => dummyChain,
  rangeLte: () => dummyChain,
  rangeAdjacent: () => dummyChain,
  ilike: () => dummyChain,
  like: () => dummyChain,
  single: () => Promise.resolve({ data: null, error: null }),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  csv: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
};

const dummyAuth = {
    getSession: () =>
        Promise.resolve({
            data: {
                session: {
                    access_token: "local-token",
                    user: { id: "local-user", email: "local@localhost" },
                },
            },
            error: null,
        }),
    getUser: () =>
        Promise.resolve({
            data: {
                user: { id: "local-user", email: "local@localhost" },
            },
            error: null,
        }),
    signUp: () =>
        Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithPassword: () =>
        Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithOAuth: () =>
        Promise.resolve({ data: { url: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
    }),
    resetPasswordForEmail: () =>
        Promise.resolve({ data: null, error: null }),
    updateUser: () =>
        Promise.resolve({ data: { user: null }, error: null }),
    setSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
    refreshSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
    resend: () =>
        Promise.resolve({ data: { user: null }, error: null }),
};

export const supabase: any = {
  from: () => dummyChain,
  auth: dummyAuth,
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: null }),
      download: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      remove: () => Promise.resolve({ data: null, error: null }),
      list: () => Promise.resolve({ data: [], error: null }),
    }),
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
};
