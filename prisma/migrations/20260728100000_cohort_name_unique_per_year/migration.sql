-- A batch **is** its intake year. Until now nothing enforced that: the seed
-- shipped `Batch 2026 — Data Science` alongside `Batch 2026 — Product Design`,
-- two rows describing the same generation, and every picker in the frontend had
-- to grow track-parsing helpers just to tell them apart.
--
-- The rule is enforced in two halves, and it needs both. `CreateCohortDto` /
-- `UpdateCohortDto` pin the name to exactly `Batch YYYY`; the unique index
-- below then makes the *year* unique, because once the format is fixed the name
-- and the year are the same key. The index alone would not do it — with a track
-- suffix allowed, the two 2026 rows above are distinct names and both pass.

-- Normalise legacy names to the canonical `Batch YYYY`, but only where that
-- cannot collide: a row is left alone if some other row already claims its
-- year. Merging two same-year cohorts is not a rename — they own separate
-- students, periods, dimensions and (in the shipped seed) different scoring
-- scales, so there is no correct way to fold one into the other in SQL.
UPDATE "cohorts" c
SET "name" = 'Batch ' || substring(c."name" from '(20[0-9]{2})')
WHERE substring(c."name" from '(20[0-9]{2})') IS NOT NULL
  AND c."name" <> 'Batch ' || substring(c."name" from '(20[0-9]{2})')
  AND NOT EXISTS (
    SELECT 1
    FROM "cohorts" o
    WHERE o."id" <> c."id"
      AND substring(o."name" from '(20[0-9]{2})')
          = substring(c."name" from '(20[0-9]{2})')
  );

-- Stop if any year is still claimed twice. The unique index below cannot catch
-- this on its own: `Batch 2026 — Data Science` and `Batch 2026 — Product
-- Design` are two distinct *names*, so the index accepts both while the year —
-- the thing that actually identifies a batch — is duplicated. Failing here is
-- the point. The alternative is an index that silently does not enforce the
-- rule it was added for, leaving the invariant false on day one.
DO $$
DECLARE
  duplicated text;
BEGIN
  SELECT string_agg(year, ', ' ORDER BY year) INTO duplicated
  FROM (
    SELECT substring("name" from '(20[0-9]{2})') AS year
    FROM "cohorts"
    WHERE substring("name" from '(20[0-9]{2})') IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
  ) dupes;

  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one batch per intake year: year(s) % are claimed by more than one cohort. Re-year or merge them first (they own separate students, periods and scoring scales, so pick deliberately), then re-run this migration. On a disposable dev database, `prisma migrate reset` reseeds to unique years instead.',
      duplicated;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_name_key" ON "cohorts"("name");
