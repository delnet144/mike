/**
 * SQLite-backed drop-in replacement for Supabase client in single-player mode.
 * All Supabase-style chaining (.from().select().eq()) maps to raw SQLite.
 */
import { db } from "./db";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toSnake(key: string): string {
    return key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        const camel = k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
        out[camel] = v;
    }
    return out;
}

function genUuid(): string {
    return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChainStep {
    table: string;
    op: "select" | "insert" | "update" | "delete" | "upsert";
    selects: string;
    filters: { col: string; op: string; value: unknown }[];
    notFilters: { col: string; op: string; value: unknown }[];
    ors: string[];
    orderCol?: string;
    orderAsc?: boolean;
    orderNullsFirst?: boolean;
    limit?: number;
    returnSingle: boolean;
    returnMaybeSingle: boolean;
    values: unknown; // insert/update/upsert data
}

function makeStep(table: string): ChainStep {
    return {
        table,
        op: "select",
        selects: "*",
        filters: [],
        notFilters: [],
        ors: [],
        returnSingle: false,
        returnMaybeSingle: false,
        values: undefined,
    };
}

// ---------------------------------------------------------------------------
// SQL execution
// ---------------------------------------------------------------------------
function buildWhere(step: ChainStep): { sql: string; params: unknown[] } {
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const f of step.filters) {
        if (f.op === "in") {
            const arr = Array.isArray(f.value) ? (f.value as unknown[]) : [];
            parts.push(`${f.col} IN (${arr.map(() => "?").join(", ")})`);
            params.push(...arr);
        } else if (f.op === "contains") {
            // JSON contains for SQLite using JSON extension
            parts.push(`json_extract(${f.col}, '$') LIKE ?`);
            params.push(`%${JSON.stringify(f.value).slice(1, -1)}%`);
        } else {
            parts.push(`${f.col} ${f.op} ?`);
            params.push(f.value);
        }
    }
    for (const f of step.notFilters) {
        if (f.op === "is" && f.value === null) {
            parts.push(`${f.col} IS NOT NULL`);
        } else {
            parts.push(`${f.col} ${f.op} ?`);
            params.push(f.value);
        }
    }
    for (const orf of step.ors) {
        const parsed = orf.split(",").map((p) => p.trim());
        const orParts: string[] = [];
        for (const p of parsed) {
            const m = p.match(/^([a-zA-Z0-9_]+)\.(eq|in)\.(.*)$/i);
            if (!m) continue;
            const col = toSnake(m[1]);
            const operator = m[2];
            const val = m[3];
            if (operator === "eq") {
                orParts.push(`${col} = ?`);
                params.push(val);
            } else if (operator === "in") {
                const vals = val
                    .replace(/^\(/, "")
                    .replace(/\)$/, "")
                    .split(/,\s*/)
                    .filter(Boolean);
                orParts.push(`${col} IN (${vals.map(() => "?").join(", ")})`);
                params.push(...vals);
            }
        }
        if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
    }
    if (!parts.length) return { sql: "", params };
    return { sql: "WHERE " + parts.join(" AND "), params };
}

function execSelect(step: ChainStep): any {
    const { sql: whereSql, params } = buildWhere(step);
    const cols = step.selects === "*" ? "*" : step.selects;
    const orderSql = step.orderCol ? `ORDER BY ${step.orderCol} ${step.orderAsc === false ? "DESC" : "ASC"}` : "";
    const limitSql = step.limit ? `LIMIT ${step.limit}` : "";
    const sql = `SELECT ${cols} FROM ${step.table} ${whereSql} ${orderSql} ${limitSql}`;
    const stmt = db.prepare(sql.trim());
    const raw = step.limit === 1 ? [stmt.get(...params)] : stmt.all(...params);
    const rows = (raw || []).filter((r): r is Record<string, unknown> => r != null).map(toCamel);
    if (step.returnSingle) {
        if (!rows.length) throw new Error("No rows found");
        return rows[0];
    }
    if (step.returnMaybeSingle) {
        return rows[0] || null;
    }
    return rows;
}

function execInsert(step: ChainStep): any {
    const rows = Array.isArray(step.values) ? (step.values as Record<string, unknown>[]) : [step.values as Record<string, unknown>];
    const results: Record<string, unknown>[] = [];
    for (const r of rows) {
        if (!("id" in r) || !r.id) r.id = genUuid();
        const keys = Object.keys(r).map(toSnake);
        const placeholders = keys.map(() => "?").join(", ");
        const params = Object.keys(r).map((k) => r[k] ?? null);
        db.prepare(`INSERT INTO ${step.table} (${keys.join(", ")}) VALUES (${placeholders})`).run(...params);
        results.push(r);
    }
    return rows.length === 1 ? results[0] : results;
}

function execUpdate(step: ChainStep): any {
    const obj = step.values as Record<string, unknown>;
    if (!obj) return null;
    const sets = Object.keys(obj)
        .filter((k) => k !== "id")
        .map((k) => `${toSnake(k)} = ?`)
        .join(", ");
    if (!sets) return null;
    const setParams = Object.keys(obj)
        .filter((k) => k !== "id")
        .map((k) => obj[k]);
    const { sql: whereSql, params: whereParams } = buildWhere(step);
    if (!whereSql) throw new Error("Update requires filters");
    db.prepare(`UPDATE ${step.table} SET ${sets} ${whereSql}`).run(...setParams, ...whereParams);
    return null;
}

function execDelete(step: ChainStep): any {
    const { sql: whereSql, params: whereParams } = buildWhere(step);
    if (!whereSql) throw new Error("Delete requires filters");
    db.prepare(`DELETE FROM ${step.table} ${whereSql}`).run(...whereParams);
    return null;
}

function execUpsert(step: ChainStep): any {
    const rows = Array.isArray(step.values) ? (step.values as Record<string, unknown>[]) : [step.values as Record<string, unknown>];
    for (const r of rows) {
        const existing = r.id
            ? db.prepare(`SELECT 1 FROM ${step.table} WHERE id = ?`).get(r.id as string)
            : undefined;
        if (existing) {
            const sets = Object.keys(r)
                .filter((k) => k !== "id")
                .map((k) => `${toSnake(k)} = ?`)
                .join(", ");
            if (sets) {
                const params = Object.keys(r)
                    .filter((k) => k !== "id")
                    .map((k) => r[k]);
                db.prepare(`UPDATE ${step.table} SET ${sets} WHERE id = ?`).run(...params, r.id);
            }
        } else {
            if (!("id" in r) || !r.id) r.id = genUuid();
            const keys = Object.keys(r).map(toSnake);
            const params = Object.keys(r).map((k) => r[k]);
            db.prepare(`INSERT INTO ${step.table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...params);
        }
    }
    return rows.length === 1 ? rows[0] : rows;
}

function runStep(step: ChainStep): any {
    switch (step.op) {
        case "select":
            return execSelect(step);
        case "insert":
            return execInsert(step);
        case "update":
            return execUpdate(step);
        case "delete":
            return execDelete(step);
        case "upsert":
            return execUpsert(step);
    }
}

// ---------------------------------------------------------------------------
// Chain builder (Supabase-compatible fluent API)
// ---------------------------------------------------------------------------
export interface SupabaseTableChain {
    select(cols?: string, opts?: any): SupabaseTableChain;
    eq(col: string, value: unknown): SupabaseTableChain;
    neq(col: string, value: unknown): SupabaseTableChain;
    gt(col: string, value: unknown): SupabaseTableChain;
    in(col: string, values: unknown[]): SupabaseTableChain;
    contains(col: string, value: unknown): SupabaseTableChain;
    not(col: string, op: string, value: unknown): SupabaseTableChain;
    is(col: string, value: unknown): SupabaseTableChain;
    or(filter: string): SupabaseTableChain;
    match(obj: Record<string, unknown>): SupabaseTableChain;
    order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): SupabaseTableChain;
    single(): SupabaseTableChain;
    maybeSingle(): SupabaseTableChain;
    limit(n: number): SupabaseTableChain;
    insert(values: unknown): SupabaseTableChain;
    update(values: unknown): SupabaseTableChain;
    delete(): SupabaseTableChain;
    upsert(values: unknown): SupabaseTableChain;
    then(
        onful?: (value: { data: any; error: any | { message: string } }) => any,
        onrej?: (reason: unknown) => any,
    ): Promise<any>;
}

function makeChain(table: string): SupabaseTableChain {
    const step = makeStep(table);
    const chain: SupabaseTableChain = {
        select(cols?: string, _opts?: any): SupabaseTableChain {
            step.selects = cols || "*";
            return chain;
        },
        eq(col: string, value: unknown): SupabaseTableChain {
            step.filters.push({ col: toSnake(col), op: "=", value });
            return chain;
        },
        neq(col: string, value: unknown): SupabaseTableChain {
            step.filters.push({ col: toSnake(col), op: "!=", value });
            return chain;
        },
        gt(col: string, value: unknown): SupabaseTableChain {
            step.filters.push({ col: toSnake(col), op: ">", value });
            return chain;
        },
        in(col: string, values: unknown[]): SupabaseTableChain {
            step.filters.push({ col: toSnake(col), op: "in", value: values });
            return chain;
        },
        contains(col: string, value: unknown): SupabaseTableChain {
            step.filters.push({ col: toSnake(col), op: "contains", value });
            return chain;
        },
        is(col: string, value: unknown): SupabaseTableChain {
            if (value === null) {
                step.filters.push({ col: toSnake(col), op: "IS", value: null });
            } else {
                step.filters.push({ col: toSnake(col), op: "=", value });
            }
            return chain;
        },
        not(col: string, op: string, value: unknown): SupabaseTableChain {
            step.notFilters.push({ col: toSnake(col), op, value });
            return chain;
        },
        or(filter: string): SupabaseTableChain {
            step.ors.push(filter);
            return chain;
        },
        match(obj: Record<string, unknown>): SupabaseTableChain {
            for (const [k, v] of Object.entries(obj)) {
                step.filters.push({ col: toSnake(k), op: "=", value: v });
            }
            return chain;
        },
        order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): SupabaseTableChain {
            step.orderCol = toSnake(column);
            step.orderAsc = opts?.ascending ?? true;
            step.orderNullsFirst = opts?.nullsFirst;
            return chain;
        },
        single(): SupabaseTableChain {
            step.returnSingle = true;
            step.limit = 1;
            return chain;
        },
        maybeSingle(): SupabaseTableChain {
            step.returnMaybeSingle = true;
            step.limit = 1;
            return chain;
        },
        limit(n: number): SupabaseTableChain {
            step.limit = n;
            return chain;
        },
        insert(values: unknown): SupabaseTableChain {
            step.op = "insert";
            step.values = values;
            return chain;
        },
        update(values: unknown): SupabaseTableChain {
            step.op = "update";
            step.values = values;
            return chain;
        },
        delete(): SupabaseTableChain {
            step.op = "delete";
            return chain;
        },
        upsert(values: unknown): SupabaseTableChain {
            step.op = "upsert";
            step.values = values;
            return chain;
        },
        then(
            onful?: (value: { data: any; error: any | { message: string } }) => any,
            onrej?: (reason: unknown) => any,
        ): Promise<any> {
            try {
                const data = runStep(step);
                return Promise.resolve({ data, error: null }).then(onful as any, onrej);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return Promise.resolve({ data: null, error: { message: msg } }).then(
                    onful as any,
                    onrej,
                );
            }
        },
    };
    return chain;
}

// ---------------------------------------------------------------------------
// Exported clients
// ---------------------------------------------------------------------------
export function createServerSupabase(): any {
    return {
        from: makeChain,
        auth: {
            getUser: async () => ({
                data: { user: { id: "local-user", email: "local@localhost" } },
                error: null,
            }),
            admin: {
                getUserById: async () => ({
                    data: { user: { id: "local-user", email: "local@localhost" } },
                    error: null,
                }),
            },
        },
    };
}

export function createClient(_url?: string, _key?: string, _opts?: unknown): {
    from: (table: string) => SupabaseTableChain;
    auth: { getUser: (_token?: string) => Promise<{ data: { user: { id: string; email: string } }; error: null }> };
} {
    return {
        from: makeChain,
        auth: {
            getUser: async (_token?: string) => ({
                data: { user: { id: "local-user", email: "local@localhost" } },
                error: null,
            }),
        },
    };
}

export async function getUserIdFromRequest(_req: Request): Promise<string> {
    return "local-user";
}

export function createAdminClient() {
    return createClient();
}
