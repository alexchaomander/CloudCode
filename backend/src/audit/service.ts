import { nanoid } from 'nanoid';
import { db } from '../db/index.js';

export interface AuditLogParams {
  actorUserId: string | null;
  eventType: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export function logAudit(params: AuditLogParams): void {
  try {
    const id = nanoid();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO audit_logs (id, actor_user_id, event_type, target_type, target_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.actorUserId ?? null,
      params.eventType,
      params.targetType ?? null,
      params.targetId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      now
    );
  } catch (err) {
    // Audit log failures should not break the main flow
    console.error('[audit] Failed to write audit log:', err);
  }
}
