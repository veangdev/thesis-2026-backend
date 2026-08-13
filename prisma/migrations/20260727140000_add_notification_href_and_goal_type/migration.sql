-- AlterEnum
-- Safe inside a transaction on PostgreSQL 12+ as long as the new value is not
-- *used* in the same transaction; the backfill below only reads existing values.
ALTER TYPE "NotificationType" ADD VALUE 'goal';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "href" TEXT;

-- Backfill: the bell dropdown and the Notifications centre navigate on click,
-- but until now there was nowhere to store the destination, so every existing
-- row would stay inert. Derive it from the event type — the same destinations the
-- producers now write explicitly. `system` keeps NULL: a welcome message has no
-- screen to open.
UPDATE "notifications" SET "href" = '/assessments'
WHERE "type" IN ('assessment_reminder', 'submission');

UPDATE "notifications" SET "href" = '/coaching'
WHERE "type" = 'coaching_reminder';

UPDATE "notifications" SET "href" = '/journey-star'
WHERE "type" = 'achievement';
