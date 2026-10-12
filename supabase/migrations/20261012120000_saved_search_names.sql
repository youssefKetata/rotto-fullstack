-- A display name never changes the brief or requirements used to rerun a search.
alter table public.saved_briefs add column name text
  check (name is null or (name = btrim(name) and char_length(name) between 1 and 100));
grant update (name) on public.saved_briefs to authenticated;
create policy saved_briefs_rename on public.saved_briefs for update to authenticated
  using (company_id = (select private.current_company_id()))
  with check (company_id = (select private.current_company_id()));
