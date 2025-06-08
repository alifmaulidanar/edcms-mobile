import { v4 as uuidv4 } from 'uuid';
import * as SQLite from 'expo-sqlite';
import { log as handleLog, error as handleError } from './logHandler';
import { TicketPhoto, TicketPhotoStatus, UploadAuditLog } from '../types';

const DB_NAME = 'ticket_photos.db';
const db = SQLite.openDatabaseSync(DB_NAME);

// Inisialisasi table jika belum ada
export function initTicketPhotoTable() {
  try {
    db.runSync(
      `CREATE TABLE IF NOT EXISTS ticket_photos (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        queue_order INTEGER NOT NULL,
        local_uri TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );
    handleLog('[SQLite] ticket_photos table ready');
  } catch (err) {
    handleError(`[SQLite] Error create table: ${err}`);
  }
}

// Inisialisasi table audit log
export function initUploadAuditLogTable() {
  try {
    db.runSync(
      `CREATE TABLE IF NOT EXISTS upload_audit_log (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        queue_order INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        timestamp TEXT NOT NULL
      );`
    );
    handleLog('[SQLite] upload_audit_log table ready');
  } catch (err) {
    handleError(`[SQLite] Error create audit log table: ${err}`);
  }
}

// Insert foto baru ke queue
export function insertTicketPhoto(ticket_id: string, queue_order: number, local_uri: string): Promise<TicketPhoto> {
  return new Promise((resolve, reject) => {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.runSync(
        `INSERT INTO ticket_photos (id, ticket_id, queue_order, local_uri, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [id, ticket_id, queue_order, local_uri, 'pending', now, now]
      );
      handleLog(`[SQLite] Inserted photo ${id} for ticket ${ticket_id} order ${queue_order}`);
      resolve({ id, ticket_id, queue_order, local_uri, status: 'pending', created_at: now, updated_at: now });
    } catch (err) {
      handleError(`[SQLite] Error insert photo: ${err}`);
      reject(err);
    }
  });
}

// Insert audit log
export function insertUploadAuditLog(log: Omit<UploadAuditLog, 'id' | 'timestamp'> & { error_message?: string }): void {
  try {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    db.runSync(
      `INSERT INTO upload_audit_log (id, ticket_id, photo_id, queue_order, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [id, log.ticket_id, log.photo_id, log.queue_order, log.status, log.error_message || '', timestamp]
    );
    handleLog(`[AuditLog] Inserted log for photo ${log.photo_id} (status: ${log.status})`);
  } catch (err) {
    handleError(`[AuditLog] Error insert log: ${err}`);
  }
}

// Ambil semua foto pending untuk tiket tertentu, urutkan queue_order
export function getPendingPhotos(ticket_id: string): Promise<TicketPhoto[]> {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.getAllSync<TicketPhoto>(
        `SELECT * FROM ticket_photos WHERE ticket_id = ? AND status = 'pending' ORDER BY queue_order ASC;`,
        [ticket_id]
      );
      resolve(rows);
    } catch (err) {
      handleError(`[SQLite] Error get pending photos: ${err}`);
      reject(err);
    }
  });
}

// Update status foto
export function updatePhotoStatus(id: string, status: TicketPhotoStatus): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const now = new Date().toISOString();
      db.runSync(
        `UPDATE ticket_photos SET status = ?, updated_at = ? WHERE id = ?;`,
        [status, now, id]
      );
      handleLog(`[SQLite] Updated photo ${id} status to ${status}`);
      resolve();
    } catch (err) {
      handleError(`[SQLite] Error update photo status: ${err}`);
      reject(err);
    }
  });
}

// Hapus foto dari DB (misal setelah upload sukses dan file sudah dihapus)
export function deletePhoto(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.runSync(
        `DELETE FROM ticket_photos WHERE id = ?;`,
        [id]
      );
      handleLog(`[SQLite] Deleted photo ${id}`);
      resolve();
    } catch (err) {
      handleError(`[SQLite] Error delete photo: ${err}`);
      reject(err);
    }
  });
}

// Ambil jumlah foto pending untuk tiket tertentu
function countPendingPhotos(ticket_id: string): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const row = db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ticket_photos WHERE ticket_id = ? AND status = 'pending';`,
        [ticket_id]
      );
      resolve(row?.count || 0);
    } catch (err) {
      handleError(`[SQLite] Error count pending photos: ${err}`);
      reject(err);
    }
  });
}

// Ambil semua foto (untuk debug/audit)
function getAllPhotos(): Promise<TicketPhoto[]> {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.getAllSync<TicketPhoto>(
        `SELECT * FROM ticket_photos ORDER BY created_at DESC;`
      );
      resolve(rows);
    } catch (err) {
      handleError(`[SQLite] Error get all photos: ${err}`);
      reject(err);
    }
  });
}

// Get audit log by ticket
function getAuditLogByTicket(ticket_id: string): UploadAuditLog[] {
  try {
    return db.getAllSync<UploadAuditLog>(
      `SELECT * FROM upload_audit_log WHERE ticket_id = ? ORDER BY timestamp DESC;`,
      [ticket_id]
    );
  } catch (err) {
    handleError(`[AuditLog] Error get log by ticket: ${err}`);
    return [];
  }
}

// Clean audit log older than X days (default 30)
function cleanOldAuditLogs(days: number = 30): void {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    db.runSync(
      `DELETE FROM upload_audit_log WHERE timestamp < ?;`,
      [cutoff]
    );
    handleLog(`[AuditLog] Cleaned audit logs older than ${days} days`);
  } catch (err) {
    handleError(`[AuditLog] Error cleaning old logs: ${err}`);
  }
}