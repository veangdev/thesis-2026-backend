-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'achieved', 'archived');

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "status" "GoalStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "targetScore" INTEGER;

-- Backfill: until now the frontend derived status from progress
-- (`progressPercent >= 100 ? 'achieved' : 'active'`). Carry that forward so
-- existing goals keep the status they were already displaying.
UPDATE "goals" SET "status" = 'achieved' WHERE "progressPercent" >= 100;
