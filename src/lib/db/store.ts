import { supabaseUrl } from "../supabase-url";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig, Row, TableMap, TableName } from "../types";
import { TABLES } from "../types";
import { DEFAULT_CONFIG } from "../config";

/**
 * Persistence boundary. Everything in the app talks to `Store`, always scoped
 * by user id, so data isolation is enforced in one place.
 *
 *  - FileStore:     zero-setup local development (JSON file in .data/).
 *  - SupabaseStore: Postgres with the schema in supabase/migrations.
 *
 * Which one is used depends on whether Supabase env vars are present.
 */

export type NewRow<K extends TableName> = Omit<TableMap[K], keyof Row> & Partial<Row>;

export interface Store {
  readonly kind: "file" | "supabase";
  list<K extends TableName>(table: K, userId: string): Promise<TableMap[K][]>;
  get<K extends TableName>(table: K, userId: string, id: string): Promise<TableMap[K] | null>;
  insert<K extends TableName>(table: K, userId: string, data: NewRow<K>): Promise<TableMap[K]>;
  update<K extends TableName>(table: K, userId: string, id: string, patch: Partial<TableMap[K]>): Promise<TableMap[K] | null>;
  remove(table: TableName, userId: string, id: string): Promise<boolean>;
  removeWhere(table: TableName, userId: string, pred: (r: Row) => boolean): Promise<number>;
  // privileged lookups (used by auth only)
  findProfileByEmail(email: string): Promise<TableMap["profiles"] | null>;
  // global config (credit costs, plans) — editable by the business owner
  getConfig(): Promise<AppConfig>;
  setConfig(c: AppConfig): Promise<void>;
  // owner-level analytics across all users (admin report)
  listAll<K extends TableName>(table: K): Promise<TableMap[K][]>;
}

const now = () => new Date().toISOString();

function prepare<K extends TableName>(table: K, userId: string, data: NewRow<K>): TableMap[K] {
  const id = (data as Partial<Row>).id ?? (table === "profiles" ? userId : randomUUID());
  const ts = now();
  return { created_at: ts, updated_at: ts, ...data, id, user_id: userId } as unknown as TableMap[K];
}

// ---------------------------------------------------------------- FileStore

interface FileShape {
  tables: Record<string, Row[]>;
  config: AppConfig | null;
}

class FileStore implements Store {
  readonly kind = "file" as const;
  private data: FileShape;
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "db.json");
    this.data = { tables: {}, config: null };
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      // corrupt file: keep a backup and start clean rather than crash the app
      try { fs.renameSync(this.file, this.file + ".corrupt-" + Date.now()); } catch { /* ignore */ }
    }
    for (const t of TABLES) this.data.tables[t] ??= [];
  }

  private persist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    }, 40);
  }

  private rows(t: TableName): Row[] { return (this.data.tables[t] ??= []); }

  async list<K extends TableName>(table: K, userId: string) {
    return this.rows(table).filter((r) => r.user_id === userId).map((r) => structuredClone(r)) as unknown as TableMap[K][];
  }
  async get<K extends TableName>(table: K, userId: string, id: string) {
    const r = this.rows(table).find((x) => x.id === id && x.user_id === userId);
    return r ? (structuredClone(r) as unknown as TableMap[K]) : null;
  }
  async insert<K extends TableName>(table: K, userId: string, data: NewRow<K>) {
    const row = prepare(table, userId, data);
    this.rows(table).push(structuredClone(row) as unknown as Row);
    this.persist();
    return row;
  }
  async update<K extends TableName>(table: K, userId: string, id: string, patch: Partial<TableMap[K]>) {
    const r = this.rows(table).find((x) => x.id === id && x.user_id === userId);
    if (!r) return null;
    Object.assign(r, structuredClone(patch), { updated_at: now(), id: r.id, user_id: r.user_id });
    this.persist();
    return structuredClone(r) as unknown as TableMap[K];
  }
  async remove(table: TableName, userId: string, id: string) {
    const arr = this.rows(table);
    const i = arr.findIndex((x) => x.id === id && x.user_id === userId);
    if (i < 0) return false;
    arr.splice(i, 1);
    this.persist();
    return true;
  }
  async removeWhere(table: TableName, userId: string, pred: (r: Row) => boolean) {
    const arr = this.rows(table);
    const keep = arr.filter((r) => !(r.user_id === userId && pred(r)));
    const n = arr.length - keep.length;
    this.data.tables[table] = keep;
    if (n) this.persist();
    return n;
  }
  async findProfileByEmail(email: string) {
    const e = email.trim().toLowerCase();
    const r = this.rows("profiles").find((p) => (p as unknown as { email: string }).email.toLowerCase() === e);
    return r ? (structuredClone(r) as unknown as TableMap["profiles"]) : null;
  }
  async getConfig() { return this.data.config ?? DEFAULT_CONFIG; }
  async setConfig(c: AppConfig) { this.data.config = c; this.persist(); }
  async listAll<K extends TableName>(table: K) {
    return this.rows(table).map((r) => structuredClone(r)) as unknown as TableMap[K][];
  }
}

// ------------------------------------------------------------ SupabaseStore
// Server-side only. Uses the service-role key, so every query is explicitly
// filtered by user_id here; RLS policies in the migration protect direct
// (anon/authenticated-key) access to the same tables.

class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private sb: any;

  constructor(client: any) { this.sb = client; }

  private col(t: TableName) { return t === "profiles" ? "id" : "user_id"; }

  private fail(error: { message: string } | null, what: string) {
    if (error) throw new Error(`Database error (${what}): ${error.message}`);
  }

  async list<K extends TableName>(table: K, userId: string) {
    const { data, error } = await this.sb.from(table).select("*").eq(this.col(table), userId).limit(5000);
    this.fail(error, `list ${table}`);
    return (data ?? []) as TableMap[K][];
  }
  async get<K extends TableName>(table: K, userId: string, id: string) {
    const { data, error } = await this.sb.from(table).select("*").eq("id", id).eq(this.col(table), userId).maybeSingle();
    this.fail(error, `get ${table}`);
    return (data ?? null) as TableMap[K] | null;
  }
  async insert<K extends TableName>(table: K, userId: string, data: NewRow<K>) {
    const row = { ...prepare(table, userId, data) } as unknown as Record<string, unknown>;
    if (table === "profiles") delete row.user_id; // profiles are keyed by id (= auth user id) and have no user_id column
    const { data: out, error } = await this.sb.from(table).insert(row).select("*").single();
    this.fail(error, `insert ${table}`);
    return out as TableMap[K];
  }
  async update<K extends TableName>(table: K, userId: string, id: string, patch: Partial<TableMap[K]>) {
    const { id: _i, user_id: _u, ...rest } = patch as Record<string, unknown>;
    void _i; void _u;
    const { data, error } = await this.sb.from(table).update({ ...rest, updated_at: now() }).eq("id", id).eq(this.col(table), userId).select("*").maybeSingle();
    this.fail(error, `update ${table}`);
    return (data ?? null) as TableMap[K] | null;
  }
  async remove(table: TableName, userId: string, id: string) {
    const { data, error } = await this.sb.from(table).delete().eq("id", id).eq(this.col(table), userId).select("id");
    this.fail(error, `delete ${table}`);
    return (data?.length ?? 0) > 0;
  }
  async removeWhere(table: TableName, userId: string, pred: (r: Row) => boolean) {
    const rows = await this.list(table, userId);
    let n = 0;
    for (const r of rows) if (pred(r as Row)) { if (await this.remove(table, userId, r.id)) n++; }
    return n;
  }
  async findProfileByEmail(email: string) {
    const { data, error } = await this.sb.from("profiles").select("*").ilike("email", email.trim()).maybeSingle();
    this.fail(error, "find profile");
    return (data ?? null) as TableMap["profiles"] | null;
  }
  async getConfig() {
    const { data } = await this.sb.from("app_config").select("value").eq("key", "main").maybeSingle();
    return (data?.value as AppConfig | undefined) ?? DEFAULT_CONFIG;
  }
  async setConfig(c: AppConfig) {
    const { error } = await this.sb.from("app_config").upsert({ key: "main", value: c, updated_at: now() });
    this.fail(error, "set config");
  }
  async listAll<K extends TableName>(table: K) {
    const { data, error } = await this.sb.from(table).select("*").limit(50000);
    this.fail(error, `listAll ${table}`);
    return (data ?? []) as TableMap[K][];
  }
}

// ------------------------------------------------------------------ factory

const g = globalThis as unknown as { __milaStore?: Store };

export function supabaseConfigured() {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getStore(): Store {
  if (g.__milaStore) return g.__milaStore;
  if (supabaseConfigured()) {
    // Lazy require keeps the client out of the bundle graph for local mode.
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    g.__milaStore = new SupabaseStore(client);
  } else {
    g.__milaStore = new FileStore(process.env.MILA_DATA_DIR || path.join(process.cwd(), ".data"));
  }
  return g.__milaStore;
}

/** For tests: swap in an isolated store. */
export function createTestStore(dir: string) {
  g.__milaStore = new FileStore(dir);
  return g.__milaStore;
}
