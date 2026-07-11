import Database from 'better-sqlite3';

/**
 * 前台本地任务状态机（SQLite）。
 * 解决"异常重传"：拍照即落一条 pending 任务，上传中持久化断点，
 * 成功后 status=completed 并删本地文件、但保留任务记录（对账/去重）。
 * 进程崩溃重启后扫描非 completed 任务续传。
 */
export interface Task {
  id: string;
  clientPhotoId: string;
  localPath: string;
  filename: string;
  size: number;
  sha256: string;
  contentType: string;
  capturedAt: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadId: string | null;
  uploadedBytes: number;
  cosKey: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

export class TaskStore {
  private db: Database.Database;
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upload_task (
        id TEXT PRIMARY KEY,
        clientPhotoId TEXT UNIQUE NOT NULL,
        localPath TEXT NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        contentType TEXT NOT NULL,
        capturedAt INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        uploadId TEXT,
        uploadedBytes INTEGER NOT NULL DEFAULT 0,
        cosKey TEXT,
        error TEXT,
        createdAt INTEGER NOT NULL,
        completedAt INTEGER
      );
    `);
  }

  insert(t: Omit<Task, 'status' | 'uploadId' | 'uploadedBytes' | 'cosKey' | 'error' | 'completedAt'>): Task {
    this.db
      .prepare(
        `INSERT INTO upload_task (id, clientPhotoId, localPath, filename, size, sha256, contentType, capturedAt, status, uploadedBytes, createdAt)
         VALUES (@id, @clientPhotoId, @localPath, @filename, @size, @sha256, @contentType, @capturedAt, 'pending', 0, @createdAt)`,
      )
      .run(t);
    return this.get(t.id)!;
  }

  get(id: string): Task | undefined {
    return this.db.prepare('SELECT * FROM upload_task WHERE id = ?').get(id) as Task | undefined;
  }

  update(id: string, fields: Partial<Task>): void {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    this.db.prepare(`UPDATE upload_task SET ${set} WHERE id = @id`).run({ ...fields, id });
  }

  all(): Task[] {
    return this.db.prepare('SELECT * FROM upload_task ORDER BY createdAt DESC').all() as Task[];
  }

  unfinished(): Task[] {
    return this.db.prepare("SELECT * FROM upload_task WHERE status IN ('pending','uploading','failed') ORDER BY createdAt ASC").all() as Task[];
  }

  pendingCount(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM upload_task WHERE status != 'completed'").get() as { c: number }).c;
  }

  close(): void {
    this.db.close();
  }
}
