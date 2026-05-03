import { Request, Response, NextFunction } from "express";

/**
 * Single-player local mode: automatically log every request in as local-user.
 * No Supabase auth required.
 */
export async function requireAuth(
    _req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    res.locals.userId = "local-user";
    res.locals.userEmail = "local@localhost";
    res.locals.token = "local-token";
    next();
}
