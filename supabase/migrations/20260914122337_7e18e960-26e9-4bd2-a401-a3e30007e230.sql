revoke select, insert, delete on public.film_watchlist from authenticated;

create policy "Film watchlist is managed server-side only"
  on public.film_watchlist for select to authenticated using (false);