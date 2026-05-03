// Single-player local-only stub for server-side Supabase usage.
// All data goes through the local backend; this prevents crashes
// when NEXT_PUBLIC_SUPABASE_URL is not configured.

const dummyChain: any = {
  select: () => dummyChain,
  insert: () => dummyChain,
  upsert: () => dummyChain,
  update: () => dummyChain,
  delete: () => dummyChain,
  eq: () => dummyChain,
  single: () => ({ data: null, error: null }),
  maybeSingle: () => ({ data: null, error: null }),
  then: () => Promise.resolve({ data: null, error: null }),
};

export function createServerSupabase() {
  return {
    from: () => dummyChain,
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  } as any;
}

/**
 * Accept any bearer token as the local user.
 */
export async function getUserIdFromRequest(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    throw new Response("Missing or invalid Authorization header", { status: 401 });
  }
  return "local-user";
}
