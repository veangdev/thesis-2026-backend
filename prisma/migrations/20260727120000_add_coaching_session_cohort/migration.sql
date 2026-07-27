-- AlterTable
ALTER TABLE "coaching_sessions" ADD COLUMN     "cohortId" TEXT;

-- CreateIndex
CREATE INDEX "coaching_sessions_cohortId_idx" ON "coaching_sessions"("cohortId");

-- CreateIndex
CREATE INDEX "coaching_sessions_scheduledAt_idx" ON "coaching_sessions"("scheduledAt");

-- AddForeignKey
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: `cohortId` was accepted on create (to expand a cohort into
-- participants) but never stored, so existing sessions have no cohort. Derive it
-- from the participants: when every participant belongs to exactly one shared
-- cohort, that is the session's cohort. Sessions spanning cohorts, and sessions
-- whose participants have since left every cohort, stay NULL rather than being
-- assigned a cohort they only partly belong to.
UPDATE "coaching_sessions" s
SET "cohortId" = shared."cohortId"
FROM (
  SELECT p."sessionId", MIN(m."cohortId") AS "cohortId"
  FROM "coaching_participants" p
  JOIN "cohort_members" m ON m."userId" = p."userId"
  GROUP BY p."sessionId"
  HAVING COUNT(DISTINCT m."cohortId") = 1
) shared
WHERE s."id" = shared."sessionId";
