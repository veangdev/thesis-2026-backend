-- AlterTable
ALTER TABLE "coaching_sessions" ADD COLUMN "followUpAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "action_items" ADD COLUMN "assigneeId" TEXT;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
