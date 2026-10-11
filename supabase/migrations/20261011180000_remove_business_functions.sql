-- Undo locally installed search/billing functions without deleting application data.
-- IF EXISTS also makes fresh installations work with the schema-only migration.
drop function if exists public.rotto_complete_search(uuid, uuid, uuid, jsonb);
drop function if exists public.rotto_begin_search(uuid, text, text, text);
drop function if exists public.rotto_fail_search(uuid, uuid, uuid, text);
drop function if exists public.rotto_plan(uuid);
drop function if exists public.rotto_apply_billing_event(jsonb);
drop function if exists private.search_criteria_matches(public.candidates, jsonb);
drop function if exists private.search_location_matches(public.candidates, jsonb);
drop function if exists private.search_text_set(jsonb);
