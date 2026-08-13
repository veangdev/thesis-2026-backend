-- `notifyGoalAchieved` used to stamp `href = '/goals'` on both of its branches.
-- That is right for the student branch and wrong for the facilitator one:
-- `/goals` is the self-assessor's own board, and it is now guarded to that role,
-- so every already-delivered "X marked Y as achieved" notification sent to a
-- facilitator points at a screen that refuses to render for them. The producer
-- is fixed; these rows were written before the fix and keep their stale path,
-- because `href` is persisted per row at creation time.
--
-- Recovering the deep link means recovering the student, and the row does not
-- reference one — there is no goalId or studentId column, only free text. The
-- body was formatted as `<student name> marked "<goal>" as achieved.`, so the
-- name is joinable against the recipient's own assigned self-assessors. That is
-- narrow enough to be safe: the candidate set is one facilitator's roster, not
-- the whole user table.

-- Resolvable rows: exactly one assigned self-assessor whose name opens the
-- body. The single-match requirement is what makes this trustworthy — a
-- facilitator mentoring two people with the same name gives an ambiguous
-- answer, and guessing between them would send the reader to the wrong record.
UPDATE "notifications" n
SET "href" = '/students?studentId=' || matched."id" || '&panel=goals'
FROM (
  SELECT
    n2."id" AS notification_id,
    (
      SELECT s."id"
      FROM "mentor_assignments" ma
      JOIN "users" s ON s."id" = ma."selfAssessorId"
      WHERE ma."facilitatorId" = n2."userId"
        AND n2."body" LIKE s."name" || ' marked%'
      LIMIT 1
    ) AS "id",
    (
      SELECT count(*)
      FROM "mentor_assignments" ma
      JOIN "users" s ON s."id" = ma."selfAssessorId"
      WHERE ma."facilitatorId" = n2."userId"
        AND n2."body" LIKE s."name" || ' marked%'
    ) AS match_count
  FROM "notifications" n2
  JOIN "users" u ON u."id" = n2."userId"
  WHERE n2."type" = 'goal'
    AND n2."href" = '/goals'
    AND u."role" <> 'self_assessor'
) matched
WHERE n."id" = matched.notification_id
  AND matched.match_count = 1;

-- Whatever is left is a staff-owned `goal` notification we could not resolve:
-- the student was unassigned or deleted since, the name is ambiguous, or the
-- body predates that wording. Send those to the roster instead. It is not the
-- deep link, but it is a screen the reader can actually open and search, which
-- `/goals` no longer is for them.
UPDATE "notifications" n
SET "href" = '/students'
FROM "users" u
WHERE u."id" = n."userId"
  AND n."type" = 'goal'
  AND n."href" = '/goals'
  AND u."role" <> 'self_assessor';
