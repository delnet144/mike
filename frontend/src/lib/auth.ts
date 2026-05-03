import { NextRequest } from 'next/server';

/**
 * Single-player local-only auth.
 * Accepts any bearer token and returns the local user.
 */
export async function getUserFromRequest(request: NextRequest): Promise<{
  email: string;
  id: string;
} | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  console.log('[Auth] Local user authenticated');
  return {
    email: 'local@localhost',
    id: 'local-user'
  };
}
