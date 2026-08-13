-- CreateEnum
-- The facilitator's own per-dimension judgement. Deliberately NOT a widening of
-- `assessment_scores.coachingRecommended`: that boolean is derived by the system
-- at completion (§5.5) and counted by analytics as a coaching flag, so it cannot
-- also carry an opinion the facilitator typed.
CREATE TYPE "CoachingTag" AS ENUM ('needs_focus', 'on_track', 'strength', 'coaching_recommended');

-- AlterTable
ALTER TABLE "assessment_scores" ADD COLUMN     "coachingTag" "CoachingTag";

-- AlterTable
-- The wizard and the review workspace have always collected an overall
-- reflection and an overall feedback note; there was nowhere to put them, so
-- every submission silently discarded both.
ALTER TABLE "assessments" ADD COLUMN     "overallReflection" TEXT,
ADD COLUMN     "overallFeedback" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Backfill: `completedAt` is a new column, but completed cycles already exist —
-- 'Completed <date>' in the assessments list and the detail sheet would read
-- blank for all of them. Until now `mentorSubmittedAt` was written by the same
-- call that set status = 'completed', so for historical rows the two instants are
-- genuinely identical and it is the exact value those screens used to show.
-- Going forward they diverge: `mentorSubmittedAt` marks the 'agreed' transition.
UPDATE "assessments"
SET "completedAt" = "mentorSubmittedAt"
WHERE "status" = 'completed' AND "mentorSubmittedAt" IS NOT NULL;
