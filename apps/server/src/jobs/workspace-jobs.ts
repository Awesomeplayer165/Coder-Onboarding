import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { workspaceJobItems, workspaceJobs, workspaceRecords } from "../db/schema";
import { coder } from "../services/coder";
import { audit } from "../services/audit";

export async function runWorkspaceJob(jobId: string) {
  const [job] = await db.select().from(workspaceJobs).where(eq(workspaceJobs.id, jobId)).limit(1);
  if (!job) return;

  await db.update(workspaceJobs).set({ status: "running", updatedAt: new Date() }).where(eq(workspaceJobs.id, jobId));
  const items = await db.select().from(workspaceJobItems).where(eq(workspaceJobItems.jobId, jobId));
  let completed = 0;
  let failed = 0;

  for (const item of items) {
    const [record] = await db.select().from(workspaceRecords).where(eq(workspaceRecords.id, item.workspaceRecordId)).limit(1);
    if (!record) {
      failed += 1;
      await db.update(workspaceJobItems).set({ status: "failed", error: "Workspace record missing" }).where(eq(workspaceJobItems.id, item.id));
      continue;
    }

    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await db.update(workspaceJobItems).set({ status: "running", attempts: attempt }).where(eq(workspaceJobItems.id, item.id));
        await coder.createWorkspaceBuild(record.coderWorkspaceId, job.action);
        await db
          .update(workspaceJobItems)
          .set({ status: "succeeded", attempts: attempt, updatedAt: new Date() })
          .where(eq(workspaceJobItems.id, item.id));
        completed += 1;
        lastError = "";
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown Coder API error";
      }
    }

    if (lastError) {
      failed += 1;
      await db
        .update(workspaceJobItems)
        .set({ status: "failed", error: lastError, updatedAt: new Date() })
        .where(eq(workspaceJobItems.id, item.id));
    }

    await db
      .update(workspaceJobs)
      .set({ completedItems: completed, failedItems: failed, updatedAt: new Date() })
      .where(eq(workspaceJobs.id, jobId));
  }

  await db
    .update(workspaceJobs)
    .set({ status: failed > 0 ? "failed" : "succeeded", completedItems: completed, failedItems: failed, updatedAt: new Date() })
    .where(eq(workspaceJobs.id, jobId));

  await audit({
    actorPersonId: job.createdByPersonId,
    action: `workspace.batch.${job.action}`,
    targetType: "workspace_job",
    targetId: job.id,
    metadata: { completed, failed }
  });
}
