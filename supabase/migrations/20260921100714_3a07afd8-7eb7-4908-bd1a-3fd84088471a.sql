CREATE POLICY "Owners read their own uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generation-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners write their own uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generation-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners update their own uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generation-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners delete their own uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generation-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);