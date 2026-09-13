-- Deny direct access to authenticated and anonymous users on storage objects
CREATE POLICY "Video files deny authenticated direct access"
ON storage.objects FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Video files deny anon direct access"
ON storage.objects FOR ALL TO anon
USING (false)
WITH CHECK (false);

-- Allow service_role full access to the video buckets only
CREATE POLICY "Service role full access to video buckets"
ON storage.objects FOR ALL TO service_role
USING (bucket_id IN (SELECT id FROM storage.buckets WHERE name IN ('videos','films','shorts')))
WITH CHECK (bucket_id IN (SELECT id FROM storage.buckets WHERE name IN ('videos','films','shorts')));
