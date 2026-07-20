-- Avatars were stored with the public prefix baked in ('/uploads/avatars/x.png'),
-- which meant changing UPLOAD_PUBLIC_PATH left every existing row pointing at a
-- URL that no longer resolved. Store them relative to the upload root
-- ('avatars/x.png'); the prefix is applied when the response is serialised.
UPDATE "users"
SET "avatarUrl" = regexp_replace("avatarUrl", '^/uploads/', '')
WHERE "avatarUrl" LIKE '/uploads/%';
