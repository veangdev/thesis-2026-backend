-- Coordinator portal integration.
--
-- Closes the §3 field-level deltas the coordinator screens depend on:
--   · users.gender / users.studentClass / users.studentCode  (roster columns)
--   · cohorts.description
--   · AssessmentPeriodStatus  open/closed -> active/completed
--   · notification_rules      (Settings > Notifications persistence)

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "StudentClass" AS ENUM ('A', 'B', 'C');

-- AlterEnum
--
-- Renamed in place rather than via the generated drop-and-recast block. That
-- block casts through text into a type that no longer declares 'open'/'closed',
-- so it fails on any existing row — and every seeded cohort has both. RENAME
-- VALUE preserves the rows and keeps the declaration order (upcoming, active,
-- completed).
ALTER TYPE "AssessmentPeriodStatus" RENAME VALUE 'open' TO 'active';
ALTER TYPE "AssessmentPeriodStatus" RENAME VALUE 'closed' TO 'completed';

-- AlterTable
ALTER TABLE "cohorts" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" "Gender",
ADD COLUMN     "studentClass" "StudentClass",
ADD COLUMN     "studentCode" TEXT;

-- CreateTable
CREATE TABLE "notification_rules" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_studentCode_key" ON "users"("studentCode");
