import { DatabaseSync } from "node:sqlite";
import path from "path";

const DB_PATH = path.join(process.cwd(), "study-helper.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS course (
      id INTEGER PRIMARY KEY,
      canvas_course_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      course_code TEXT,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS content_item (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
      canvas_item_id TEXT,
      type TEXT NOT NULL, -- page | assignment | announcement | file | video_transcript
      title TEXT NOT NULL,
      url TEXT,
      text TEXT NOT NULL,
      updated_at TEXT,
      due_at TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS content_item_fts USING fts5(
      title,
      text,
      content='content_item',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS content_item_ai AFTER INSERT ON content_item BEGIN
      INSERT INTO content_item_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS content_item_ad AFTER DELETE ON content_item BEGIN
      INSERT INTO content_item_fts(content_item_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
    END;

    CREATE TRIGGER IF NOT EXISTS content_item_au AFTER UPDATE ON content_item BEGIN
      INSERT INTO content_item_fts(content_item_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
      INSERT INTO content_item_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
    END;

    CREATE TABLE IF NOT EXISTS quiz (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
      topic TEXT,
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_message (
      id INTEGER PRIMARY KEY,
      course_id INTEGER REFERENCES course(id) ON DELETE SET NULL,
      role TEXT NOT NULL, -- user | assistant
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: due_at was added after content_item already existed for early users —
  // CREATE TABLE IF NOT EXISTS above won't retrofit it onto an existing table.
  const columns = db.prepare("PRAGMA table_info(content_item)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "due_at")) {
    db.exec("ALTER TABLE content_item ADD COLUMN due_at TEXT");
  }

  return db;
}

export function getSetting(key: string): string | null {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const database = getDb();
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function upsertCourse(canvasCourseId: number, name: string, courseCode: string | null) {
  const database = getDb();
  const existing = database
    .prepare("SELECT id FROM course WHERE canvas_course_id = ?")
    .get(canvasCourseId) as { id: number } | undefined;

  if (existing) {
    database
      .prepare("UPDATE course SET name = ?, course_code = ?, last_synced_at = ? WHERE id = ?")
      .run(name, courseCode, new Date().toISOString(), existing.id);
    return existing.id;
  }

  const result = database
    .prepare(
      "INSERT INTO course (canvas_course_id, name, course_code, last_synced_at) VALUES (?, ?, ?, ?)"
    )
    .run(canvasCourseId, name, courseCode, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function replaceContentItem(
  courseId: number,
  canvasItemId: string,
  type: string,
  title: string,
  url: string | null,
  text: string,
  updatedAt: string | null,
  dueAt: string | null = null
) {
  const database = getDb();
  const existing = database
    .prepare(
      "SELECT id FROM content_item WHERE course_id = ? AND canvas_item_id = ? AND type = ?"
    )
    .get(courseId, canvasItemId, type) as { id: number } | undefined;

  if (existing) {
    database
      .prepare("UPDATE content_item SET title = ?, url = ?, text = ?, updated_at = ?, due_at = ? WHERE id = ?")
      .run(title, url, text, updatedAt, dueAt, existing.id);
    return existing.id;
  }

  const result = database
    .prepare(
      "INSERT INTO content_item (course_id, canvas_item_id, type, title, url, text, updated_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(courseId, canvasItemId, type, title, url, text, updatedAt, dueAt);
  return Number(result.lastInsertRowid);
}

export interface UpcomingAssignment {
  id: number;
  course_id: number;
  course_name: string;
  title: string;
  url: string | null;
  due_at: string;
  text: string;
}

/**
 * Assignments/quizzes with a known due date, soonest first. Includes items due
 * within the last `pastDays` (so recently-missed/just-due work still shows up)
 * through any point in the future.
 */
export function listUpcomingAssignments(pastDays = 2, limit = 30): UpcomingAssignment[] {
  const database = getDb();
  const cutoff = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString();
  return database
    .prepare(
      `SELECT ci.id, ci.course_id, c.name as course_name, ci.title, ci.url, ci.due_at, ci.text
       FROM content_item ci
       JOIN course c ON c.id = ci.course_id
       WHERE ci.due_at IS NOT NULL AND ci.due_at >= ?
       ORDER BY ci.due_at ASC
       LIMIT ?`
    )
    .all(cutoff, limit) as unknown as UpcomingAssignment[];
}

export function getContentItem(id: number) {
  const database = getDb();
  return database.prepare("SELECT * FROM content_item WHERE id = ?").get(id) as
    | { id: number; course_id: number; type: string; title: string; url: string | null; text: string; due_at: string | null }
    | undefined;
}

export interface SearchResult {
  id: number;
  course_id: number;
  type: string;
  title: string;
  url: string | null;
  text: string;
}

export function searchContent(courseId: number | null, query: string, limit = 8): SearchResult[] {
  const database = getDb();
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  const rows = courseId
    ? database
        .prepare(
          `SELECT ci.id, ci.course_id, ci.type, ci.title, ci.url, ci.text
           FROM content_item_fts f
           JOIN content_item ci ON ci.id = f.rowid
           WHERE content_item_fts MATCH ? AND ci.course_id = ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(ftsQuery, courseId, limit)
    : database
        .prepare(
          `SELECT ci.id, ci.course_id, ci.type, ci.title, ci.url, ci.text
           FROM content_item_fts f
           JOIN content_item ci ON ci.id = f.rowid
           WHERE content_item_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(ftsQuery, limit);

  return rows as unknown as SearchResult[];
}

function sanitizeFtsQuery(raw: string): string {
  const terms = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((t) => t.length > 1);
  return terms.map((t) => `"${t}"`).join(" OR ");
}

export function getCourse(id: number) {
  const database = getDb();
  return database.prepare("SELECT * FROM course WHERE id = ?").get(id) as
    | { id: number; canvas_course_id: number; name: string; course_code: string | null; last_synced_at: string | null }
    | undefined;
}

export function listContentItems(courseId: number) {
  const database = getDb();
  return database
    .prepare(
      "SELECT id, type, title, url, updated_at FROM content_item WHERE course_id = ? ORDER BY type, title"
    )
    .all(courseId) as { id: number; type: string; title: string; url: string | null; updated_at: string | null }[];
}

export function createQuiz(courseId: number, topic: string, questionsJson: string) {
  const database = getDb();
  const result = database
    .prepare(
      "INSERT INTO quiz (course_id, topic, questions_json, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(courseId, topic, questionsJson, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function getQuiz(id: number) {
  const database = getDb();
  return database.prepare("SELECT * FROM quiz WHERE id = ?").get(id) as
    | { id: number; course_id: number; topic: string | null; questions_json: string; created_at: string }
    | undefined;
}

export function addChatMessage(courseId: number | null, role: "user" | "assistant", content: string) {
  const database = getDb();
  database
    .prepare(
      "INSERT INTO chat_message (course_id, role, content, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(courseId, role, content, new Date().toISOString());
}

export function listChatMessages(courseId: number | null, limit = 20) {
  const database = getDb();
  const rows = courseId
    ? database
        .prepare(
          "SELECT role, content FROM chat_message WHERE course_id = ? ORDER BY id DESC LIMIT ?"
        )
        .all(courseId, limit)
    : database
        .prepare("SELECT role, content FROM chat_message WHERE course_id IS NULL ORDER BY id DESC LIMIT ?")
        .all(limit);
  return (rows as { role: "user" | "assistant"; content: string }[]).reverse();
}

export function listCourses() {
  const database = getDb();
  return database
    .prepare(
      `SELECT c.id, c.canvas_course_id, c.name, c.course_code, c.last_synced_at,
              (SELECT COUNT(*) FROM content_item ci WHERE ci.course_id = c.id) AS content_count
       FROM course c
       ORDER BY c.name`
    )
    .all();
}
