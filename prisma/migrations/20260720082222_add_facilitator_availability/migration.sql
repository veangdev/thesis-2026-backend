-- Days a facilitator is available to coach, stored as YYYY-MM-DD calendar
-- dates so they never shift across timezones.
ALTER TABLE "users" ADD COLUMN "availability" TEXT[] DEFAULT ARRAY[]::TEXT[];
