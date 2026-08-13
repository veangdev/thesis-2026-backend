-- CreateEnum
CREATE TYPE "CohortStatus" AS ENUM ('active', 'completed', 'archived');

-- AlterTable
ALTER TABLE "cohorts" ADD COLUMN     "status" "CohortStatus" NOT NULL DEFAULT 'active';
