import { db } from "../db/client";
import { auditEvents } from "../db/schema";

export async function audit(input: {
  actorPersonId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditEvents).values({
    actorPersonId: input.actorPersonId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {}
  });
}
