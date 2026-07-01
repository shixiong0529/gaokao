import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let defaultDb = null;

function defaultDbPath() {
  return process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function publicInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    note: row.note || '',
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    disabledAt: row.disabled_at,
    createdAt: row.created_at
  };
}

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function createLocalDb(databasePath = defaultDbPath()) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      note TEXT,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      disabled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_code_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_code_id INTEGER NOT NULL REFERENCES invite_codes(id),
      status TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      reserved_at TEXT NOT NULL,
      completed_at TEXT,
      released_at TEXT
    );
  `);

  const saveMessageStmt = db.prepare(`
    INSERT INTO messages (name, email, message, ip, user_agent, status, created_at)
    VALUES (@name, @email, @message, @ip, @userAgent, 'new', @createdAt)
  `);
  const getMessageStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  const listMessagesStmt = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?');

  const insertInviteStmt = db.prepare(`
    INSERT INTO invite_codes (code, note, max_uses, used_count, expires_at, disabled_at, created_at)
    VALUES (@code, @note, @maxUses, 0, @expiresAt, NULL, @createdAt)
  `);
  const getInviteByCodeStmt = db.prepare('SELECT * FROM invite_codes WHERE code = ?');
  const getInviteByIdStmt = db.prepare('SELECT * FROM invite_codes WHERE id = ?');
  const listInvitesStmt = db.prepare('SELECT * FROM invite_codes ORDER BY id DESC LIMIT ?');
  const incrementInviteUseStmt = db.prepare('UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?');
  const decrementInviteUseStmt = db.prepare('UPDATE invite_codes SET used_count = MAX(used_count - 1, 0) WHERE id = ?');
  const insertUseStmt = db.prepare(`
    INSERT INTO invite_code_uses (invite_code_id, status, ip, user_agent, reserved_at)
    VALUES (@inviteCodeId, 'reserved', @ip, @userAgent, @reservedAt)
  `);
  const getUseStmt = db.prepare('SELECT * FROM invite_code_uses WHERE id = ?');
  const completeUseStmt = db.prepare(`
    UPDATE invite_code_uses
    SET status = 'used', completed_at = @completedAt
    WHERE id = @id AND status = 'reserved'
  `);
  const releaseUseStmt = db.prepare(`
    UPDATE invite_code_uses
    SET status = 'released', released_at = @releasedAt
    WHERE id = @id AND status = 'reserved'
  `);

  function saveMessage(input) {
    const name = String(input?.name || '').trim();
    const email = String(input?.email || '').trim();
    const message = String(input?.message || '').trim();
    if (!name || !email || !message) {
      throw withStatus('请填写称呼、邮箱和留言内容');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw withStatus('邮箱格式不正确');
    }

    const info = saveMessageStmt.run({
      name,
      email,
      message,
      ip: input?.ip || '',
      userAgent: input?.userAgent || '',
      createdAt: nowIso()
    });
    const row = getMessageStmt.get(info.lastInsertRowid);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      message: row.message,
      ip: row.ip,
      userAgent: row.user_agent,
      status: row.status,
      createdAt: row.created_at
    };
  }

  function listMessages({ limit = 50 } = {}) {
    return listMessagesStmt.all(Math.max(1, Math.min(Number(limit) || 50, 200))).map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      message: row.message,
      ip: row.ip,
      userAgent: row.user_agent,
      status: row.status,
      createdAt: row.created_at
    }));
  }

  function createInviteCode(input = {}) {
    const code = normalizeCode(input.code);
    const maxUses = Math.max(1, Number(input.maxUses || 1));
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) {
      throw withStatus('邀请码只能包含 4-32 位大写字母、数字或连字符');
    }

    let expiresAt = null;
    if (input.expiresAt) {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) throw withStatus('过期时间格式不正确');
      expiresAt = parsed.toISOString();
    }

    try {
      const info = insertInviteStmt.run({
        code,
        note: String(input.note || '').trim(),
        maxUses,
        expiresAt,
        createdAt: nowIso()
      });
      return publicInvite(getInviteByIdStmt.get(info.lastInsertRowid));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw withStatus('邀请码已存在');
      throw err;
    }
  }

  const reserveTx = db.transaction((rawCode, meta = {}) => {
    const code = normalizeCode(rawCode);
    if (!code) throw withStatus('请输入邀请码');

    const invite = getInviteByCodeStmt.get(code);
    if (!invite) throw withStatus('邀请码不存在');
    if (invite.disabled_at) throw withStatus('邀请码已停用');
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw withStatus('邀请码已过期');
    }
    if (invite.used_count >= invite.max_uses) {
      throw withStatus('邀请码已用完');
    }

    incrementInviteUseStmt.run(invite.id);
    const info = insertUseStmt.run({
      inviteCodeId: invite.id,
      ip: meta.ip || '',
      userAgent: meta.userAgent || '',
      reservedAt: nowIso()
    });

    return {
      reservationId: info.lastInsertRowid,
      code: invite.code
    };
  });

  function reserveInviteCode(code, meta = {}) {
    return reserveTx(code, meta);
  }

  const completeTx = db.transaction((reservationId) => {
    const use = getUseStmt.get(reservationId);
    if (!use) throw withStatus('邀请码预占记录不存在', 404);
    const result = completeUseStmt.run({ id: reservationId, completedAt: nowIso() });
    return result.changes > 0;
  });

  function completeInviteReservation(reservationId) {
    return completeTx(reservationId);
  }

  const releaseTx = db.transaction((reservationId) => {
    const use = getUseStmt.get(reservationId);
    if (!use || use.status !== 'reserved') return false;

    const changed = releaseUseStmt.run({ id: reservationId, releasedAt: nowIso() }).changes > 0;
    if (changed) decrementInviteUseStmt.run(use.invite_code_id);
    return changed;
  });

  function releaseInviteReservation(reservationId) {
    return releaseTx(reservationId);
  }

  function listInviteCodes({ limit = 100 } = {}) {
    return listInvitesStmt.all(Math.max(1, Math.min(Number(limit) || 100, 500))).map(publicInvite);
  }

  function close() {
    db.close();
  }

  return {
    saveMessage,
    listMessages,
    createInviteCode,
    reserveInviteCode,
    completeInviteReservation,
    releaseInviteReservation,
    listInviteCodes,
    close
  };
}

export function getLocalDb() {
  if (!defaultDb) defaultDb = createLocalDb();
  return defaultDb;
}

export function generateInviteCode(prefix = 'CM') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${part(4)}-${part(4)}`;
}
