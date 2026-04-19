-- Make the sora bucket public so getPublicUrl returns accessible links.
update storage.buckets set public = true where id = 'sora';

-- Allow client-side uploads via the anon key.
create policy "sora anon upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'sora');

-- Explicit SELECT policy (also covered by public bucket, but explicit is nicer).
create policy "sora anon read"
  on storage.objects for select
  to anon
  using (bucket_id = 'sora');
