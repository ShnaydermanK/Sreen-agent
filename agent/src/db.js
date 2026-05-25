const path = require("path");
const fs = require("fs");
const { getDataDir } = require("./config");

class DB {
  constructor() {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "agent.db");

    try {
      const Database = require("better-sqlite3");
      this.db = new Database(dbPath);
      this._init();
      console.log("[db] SQLite opened:", dbPath);
    } catch (e) {
      console.warn("[db] SQLite unavailable, using in-memory:", e.message);
      this.db = null;
      this._memEvents = [];
      this._memSegments = [];
    }
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pending_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        metadata TEXT NOT NULL,
        uploaded INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  addEvent(event) {
    if (this.db) {
      this.db.prepare("INSERT INTO pending_events (payload) VALUES (?)").run(JSON.stringify(event));
    } else {
      this._memEvents.push(event);
    }
  }

  flushEvents(limit = 200) {
    if (this.db) {
      const rows = this.db.prepare("SELECT id, payload FROM pending_events ORDER BY id LIMIT ?").all(limit);
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      this.db.prepare(`DELETE FROM pending_events WHERE id IN (${ids.join(",")})`).run();
      return rows.map((r) => JSON.parse(r.payload));
    }
    return this._memEvents.splice(0, limit);
  }

  addSegment(filePath, metadata) {
    if (this.db) {
      this.db
        .prepare("INSERT INTO pending_segments (file_path, metadata) VALUES (?, ?)")
        .run(filePath, JSON.stringify(metadata));
    } else {
      this._memSegments.push({ filePath, metadata });
    }
  }

  getPendingSegments() {
    if (this.db) {
      return this.db
        .prepare("SELECT id, file_path, metadata FROM pending_segments WHERE uploaded = 0 ORDER BY id")
        .all()
        .map((r) => ({ id: r.id, filePath: r.file_path, metadata: JSON.parse(r.metadata) }));
    }
    return this._memSegments.map((s, i) => ({ id: i, ...s }));
  }

  markSegmentUploaded(id) {
    if (this.db) {
      this.db.prepare("UPDATE pending_segments SET uploaded = 1 WHERE id = ?").run(id);
    } else {
      this._memSegments = this._memSegments.filter((_, i) => i !== id);
    }
  }

  countPending() {
    if (this.db) {
      return this.db.prepare("SELECT COUNT(*) as c FROM pending_segments WHERE uploaded = 0").get().c;
    }
    return this._memSegments.length;
  }
}

module.exports = { DB };
