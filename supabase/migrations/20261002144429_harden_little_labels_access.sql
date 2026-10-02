-- Tighten existing APIs and write policies only. No rows are changed.
CREATE OR REPLACE FUNCTION public.activate_little_labels(code_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  row_rec public.little_labels_entitlements%rowtype;
begin
  if uid is null or not exists (select 1 from auth.users u where u.id = uid and u.is_anonymous is false and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())) then
    return jsonb_build_object('success', false, 'error', 'Sign in with a permanent account first.');
  end if;

  select * into row_rec
  from public.little_labels_entitlements
  where activation_code = upper(trim(code_input))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'That activation code was not found.');
  end if;

  if row_rec.status = 'disabled' then
    return jsonb_build_object('success', false, 'error', 'That activation code is no longer active.');
  end if;

  if (row_rec.status = 'activated' and row_rec.activated_by is distinct from uid)
     or (row_rec.activated_by is not null and row_rec.activated_by is distinct from uid) then
    return jsonb_build_object('success', false, 'error', 'That activation code has already been used.');
  end if;

  if row_rec.status = 'available' then
    update public.little_labels_entitlements
    set status = 'activated', activated_by = uid, activated_at = now()
    where id = row_rec.id;
  end if;

  return jsonb_build_object('success', true, 'active', true);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.little_labels_access_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select jsonb_build_object('active',
    auth.uid() is not null and exists (
      select 1 from auth.users u
      where u.id = auth.uid() and u.is_anonymous is false
        and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
    ) and exists (
      select 1 from public.little_labels_entitlements e
      where e.activated_by = auth.uid() and e.status = 'activated'
    )
  );
$function$;
ALTER POLICY "Users can add their own labels" ON public.labels TO authenticated WITH CHECK ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));
ALTER POLICY "Users can delete their own labels" ON public.labels TO authenticated USING ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));
ALTER POLICY "Users can update their own labels" ON public.labels TO authenticated USING ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean)) WITH CHECK ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));
ALTER POLICY "Users can add to their own print queue" ON public.print_queue TO authenticated WITH CHECK ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));
ALTER POLICY "Users can delete from their own print queue" ON public.print_queue TO authenticated USING ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));
ALTER POLICY "Users can update their own print queue" ON public.print_queue TO authenticated USING ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean)) WITH CHECK ((select auth.uid()) = user_id and (select (public.little_labels_access_status()->>'active')::boolean));

-- Approved removal of table-wide capabilities unused by the app's CRUD flows.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.labels, public.print_queue FROM anon, authenticated;

-- Private, bounded usage metadata only: two rows per account, no label contents.
CREATE SCHEMA IF NOT EXISTS little_labels_private;
REVOKE ALL ON SCHEMA little_labels_private FROM PUBLIC, anon, authenticated;
CREATE TABLE little_labels_private.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('text', 'picture')),
  usage_day date NOT NULL,
  day_count integer NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  usage_minute timestamptz NOT NULL,
  minute_count integer NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  PRIMARY KEY (user_id, category)
);
ALTER TABLE little_labels_private.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON little_labels_private.ai_usage FROM PUBLIC, anon, authenticated;

-- A caller can only consume their own quota, never choose a user or increase it.
CREATE OR REPLACE FUNCTION public.consume_little_labels_ai_quota(category_input text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  usage_row little_labels_private.ai_usage%rowtype;
  moment timestamptz;
  day_start date;
  minute_start timestamptz;
  per_minute integer;
  per_day integer;
  retry_seconds integer;
BEGIN
  IF uid IS NULL OR (public.little_labels_access_status()->>'active')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('allowed',false,'reason','access');
  END IF;
  IF category_input NOT IN ('text','picture') OR category_input IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_category');
  END IF;
  per_minute := CASE WHEN category_input = 'picture' THEN 3 ELSE 20 END;
  per_day := CASE WHEN category_input = 'picture' THEN 40 ELSE 200 END;
  moment := clock_timestamp();
  INSERT INTO little_labels_private.ai_usage(user_id,category,usage_day,usage_minute)
    VALUES (uid,category_input,(moment AT TIME ZONE 'UTC')::date,date_trunc('minute',moment))
    ON CONFLICT (user_id,category) DO NOTHING;
  SELECT * INTO usage_row FROM little_labels_private.ai_usage
    WHERE user_id=uid AND category=category_input FOR UPDATE;
  -- Recompute time after waiting for a concurrent reservation to release the lock.
  moment := clock_timestamp();
  day_start := (moment AT TIME ZONE 'UTC')::date;
  minute_start := date_trunc('minute',moment);
  IF usage_row.usage_day <> day_start THEN usage_row.day_count := 0; END IF;
  IF usage_row.usage_minute <> minute_start THEN usage_row.minute_count := 0; END IF;
  IF usage_row.day_count >= per_day THEN
    retry_seconds := greatest(1,ceil(extract(epoch FROM (((day_start + 1)::timestamp AT TIME ZONE 'UTC') - moment)))::integer);
    RETURN jsonb_build_object('allowed',false,'reason','daily_limit','retry_after',retry_seconds);
  END IF;
  IF usage_row.minute_count >= per_minute THEN
    retry_seconds := greatest(1,ceil(extract(epoch FROM (minute_start + interval '1 minute' - moment)))::integer);
    RETURN jsonb_build_object('allowed',false,'reason','minute_limit','retry_after',retry_seconds);
  END IF;
  UPDATE little_labels_private.ai_usage
    SET usage_day=day_start, day_count=usage_row.day_count+1,
        usage_minute=minute_start, minute_count=usage_row.minute_count+1
    WHERE user_id=uid AND category=category_input;
  RETURN jsonb_build_object('allowed',true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.consume_little_labels_ai_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_little_labels_ai_quota(text) TO authenticated;
