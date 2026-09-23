DROP POLICY IF EXISTS "no direct access to video buckets" ON storage.objects;
DROP POLICY IF EXISTS "Video files deny anon direct access" ON storage.objects;
DROP POLICY IF EXISTS "Video files deny authenticated direct access" ON storage.objects;