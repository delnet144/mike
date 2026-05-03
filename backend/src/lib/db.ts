import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "mike.sqlite");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema — note that SQLite ignores IF NOT EXISTS on table alter, so we
// use a separate ALTER TABLE statement for new columns added after the
// initial deploy.
// ---------------------------------------------------------------------------

const TABLES = [
    // user_profiles
    `create table if not exists user_profiles (
      id text primary key default (lower(hex(randomblob(16)))),
      user_id text not null unique,
      display_name text,
      organisation text,
      tier text not null default 'Free',
      message_credits_used integer not null default 0,
      credits_reset_date text not null default (datetime('now', '+30 days')),
      tabular_model text not null default 'local-llm',
      claude_api_key text,
      gemini_api_key text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // projects
    `create table if not exists projects (
      id text primary key default (lower(hex(randomblob(16)))),
      user_id text not null,
      name text not null,
      cm_number text,
      visibility text not null default 'private',
      shared_with text not null default '[]',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // project_subfolders
    `create table if not exists project_subfolders (
      id text primary key default (lower(hex(randomblob(16)))),
      project_id text not null references projects(id) on delete cascade,
      user_id text not null,
      name text not null,
      parent_folder_id text references project_subfolders(id) on delete cascade,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // documents
    `create table if not exists documents (
      id text primary key default (lower(hex(randomblob(16)))),
      project_id text references projects(id) on delete cascade,
      user_id text not null,
      filename text not null,
      file_type text,
      size_bytes integer not null default 0,
      page_count integer,
      structure_tree text,
      status text not null default 'pending',
      folder_id text references project_subfolders(id) on delete set null,
      current_version_id text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // document_versions
    `create table if not exists document_versions (
      id text primary key default (lower(hex(randomblob(16)))),
      document_id text not null references documents(id) on delete cascade,
      storage_path text not null,
      pdf_storage_path text,
      source text not null default 'upload',
      version_number integer,
      display_name text,
      created_at text not null default (datetime('now'))
    )`,
    // chats
    `create table if not exists chats (
      id text primary key default (lower(hex(randomblob(16)))),
      project_id text references projects(id) on delete cascade,
      user_id text not null,
      title text,
      created_at text not null default (datetime('now'))
    )`,
    // chat_messages
    `create table if not exists chat_messages (
      id text primary key default (lower(hex(randomblob(16)))),
      chat_id text not null references chats(id) on delete cascade,
      role text not null,
      content text,
      files text,
      annotations text,
      workflow text,
      created_at text not null default (datetime('now'))
    )`,
    // document_edits
    `create table if not exists document_edits (
      id text primary key default (lower(hex(randomblob(16)))),
      document_id text not null references documents(id) on delete cascade,
      chat_message_id text references chat_messages(id) on delete set null,
      version_id text not null references document_versions(id) on delete cascade,
      change_id text not null,
      del_w_id text,
      ins_w_id text,
      deleted_text text not null default '',
      inserted_text text not null default '',
      context_before text,
      context_after text,
      status text not null default 'pending',
      created_at text not null default (datetime('now')),
      resolved_at text
    )`,
    // workflows
    `create table if not exists workflows (
      id text primary key default (lower(hex(randomblob(16)))),
      user_id text,
      title text not null,
      type text not null,
      prompt_md text,
      columns_config text,
      practice text,
      is_system boolean not null default false,
      created_at text not null default (datetime('now'))
    )`,
    // hidden_workflows
    `create table if not exists hidden_workflows (
      id text primary key default (lower(hex(randomblob(16)))),
      user_id text not null,
      workflow_id text not null,
      created_at text not null default (datetime('now'))
    )`,
    // workflow_shares
    `create table if not exists workflow_shares (
      id text primary key default (lower(hex(randomblob(16)))),
      workflow_id text not null references workflows(id) on delete cascade,
      shared_by_user_id text not null,
      shared_with_email text not null,
      allow_edit boolean not null default false,
      created_at text not null default (datetime('now'))
    )`,
    // tabular_reviews
    `create table if not exists tabular_reviews (
      id text primary key default (lower(hex(randomblob(16)))),
      project_id text references projects(id) on delete cascade,
      user_id text not null,
      title text,
      columns_config text,
      workflow_id text references workflows(id) on delete set null,
      practice text,
      shared_with text not null default '[]',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // tabular_cells
    `create table if not exists tabular_cells (
      id text primary key default (lower(hex(randomblob(16)))),
      review_id text not null references tabular_reviews(id) on delete cascade,
      document_id text not null references documents(id) on delete cascade,
      column_index integer not null,
      content text,
      citations text,
      status text not null default 'pending',
      created_at text not null default (datetime('now'))
    )`,
    // tabular_review_chats
    `create table if not exists tabular_review_chats (
      id text primary key default (lower(hex(randomblob(16)))),
      review_id text not null references tabular_reviews(id) on delete cascade,
      user_id text not null,
      title text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    )`,
    // tabular_review_chat_messages
    `create table if not exists tabular_review_chat_messages (
      id text primary key default (lower(hex(randomblob(16)))),
      chat_id text not null references tabular_review_chats(id) on delete cascade,
      role text not null,
      content text,
      annotations text,
      created_at text not null default (datetime('now'))
    )`,
];

const INDEXES = [
    `create index if not exists idx_user_profiles_user on user_profiles(user_id)`,
    `create index if not exists idx_projects_user on projects(user_id)`,
    `create index if not exists idx_project_subfolders_project on project_subfolders(project_id)`,
    `create index if not exists idx_documents_user_project on documents(user_id, project_id)`,
    `create index if not exists idx_documents_project_folder on documents(project_id, folder_id)`,
    `create index if not exists document_versions_document_id_idx on document_versions(document_id, created_at desc)`,
    `create index if not exists document_versions_doc_vnum_idx on document_versions(document_id, version_number)`,
    `create index if not exists idx_chats_user on chats(user_id)`,
    `create index if not exists idx_chats_project on chats(project_id)`,
    `create index if not exists idx_chat_messages_chat on chat_messages(chat_id)`,
    `create index if not exists document_edits_document_id_idx on document_edits(document_id, created_at desc)`,
    `create index if not exists document_edits_message_id_idx on document_edits(chat_message_id)`,
    `create index if not exists document_edits_version_id_idx on document_edits(version_id)`,
    `create index if not exists idx_workflows_user on workflows(user_id)`,
    `create index if not exists idx_hidden_workflows_user on hidden_workflows(user_id)`,
    `create index if not exists workflow_shares_workflow_id_idx on workflow_shares(workflow_id)`,
    `create index if not exists workflow_shares_email_idx on workflow_shares(shared_with_email)`,
    `create index if not exists idx_tabular_reviews_user on tabular_reviews(user_id)`,
    `create index if not exists idx_tabular_reviews_project on tabular_reviews(project_id)`,
    `create index if not exists idx_tabular_cells_review on tabular_cells(review_id, document_id, column_index)`,
    `create index if not exists tabular_review_chats_review_idx on tabular_review_chats(review_id, updated_at desc)`,
    `create index if not exists tabular_review_chats_user_idx on tabular_review_chats(user_id)`,
    `create index if not exists tabular_review_chat_messages_chat_idx on tabular_review_chat_messages(chat_id, created_at)`,
];

for (const stmt of TABLES) {
    try {
        db.exec(stmt.trim());
    } catch (err: any) {
        // ignore duplicate table errors
        if (!err.message?.includes("already exists")) throw err;
    }
}

for (const stmt of INDEXES) {
    db.exec(stmt.trim());
}

// Migrate: add workflow column to chat_messages if missing (older dbs)
try {
    db.exec(`ALTER TABLE chat_messages ADD COLUMN workflow text`);
} catch (err: any) {
    if (!err.message?.includes("duplicate column")) throw err;
}

// Seed single local user
db.prepare("insert or ignore into user_profiles (user_id, display_name, tier) values (?, ?, ?)").run("local-user", "Local User", "Free");

export { db };
