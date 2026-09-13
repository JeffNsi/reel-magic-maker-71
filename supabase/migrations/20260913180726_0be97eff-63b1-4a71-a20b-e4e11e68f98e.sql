-- Deny all direct browser access to the private video buckets.
-- The app's server uses the service role, which bypasses these policies.
DROP POLICY IF EXISTS "no direct access to video buckets" ON storage.objects;
CREATE POLICY "no direct access to video buckets"
ON storage.objects
FOR ALL
TO anon, authenticated
USING (bucket_id NOT IN ('films','shorts','videos'))
WITH CHECK (bucket_id NOT IN ('films','shorts','videos'));