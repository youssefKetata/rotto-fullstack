-- Keep the oldest saved copy (and its ID) when cleaning up existing duplicates.
begin;

lock table public.saved_briefs in share row exclusive mode;

delete from public.saved_briefs
where id in (
  select id from (
    select id, row_number() over (
      partition by company_id, btrim(brief), filters
      order by created_at, id
    ) as copy_number
    from public.saved_briefs
  ) as copies
  where copy_number > 1
);

update public.saved_briefs set brief = btrim(brief) where brief <> btrim(brief);

-- Compact digests keep the index within PostgreSQL's size limit for long briefs.
create unique index saved_briefs_company_search_key
  on public.saved_briefs (company_id, md5(btrim(brief)), md5(filters::text));

commit;
