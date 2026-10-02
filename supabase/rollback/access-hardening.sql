-- UNSAFE BASELINE RECOVERY ONLY: this restores the old purchase-free write rules
-- and anonymous-capable activation. Do NOT use as routine rollback.
-- Requires a fresh explicit security decision before applying to production.
-- Prefer retaining hardened policies and repairing the compatible client/guard.
-- Restore exact prior RPC and policy semantics. Review before use.
CREATE OR REPLACE FUNCTION public.activate_little_labels(code_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  row_rec public.little_labels_entitlements%rowtype;
begin
  if uid is null then
    return jsonb_build_object('success', false, 'error', 'Sign in first.');
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

  if row_rec.status = 'activated' and row_rec.activated_by is distinct from uid then
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
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'active', exists(
      select 1 from public.little_labels_entitlements
      where activated_by = auth.uid() and status = 'activated'
    )
  );
$function$
;
ALTER POLICY "Users can add their own labels" ON public.labels TO public WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users can delete their own labels" ON public.labels TO public USING ((auth.uid() = user_id));
ALTER POLICY "Users can update their own labels" ON public.labels TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users can add to their own print queue" ON public.print_queue TO public WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users can delete from their own print queue" ON public.print_queue TO public USING ((auth.uid() = user_id));
ALTER POLICY "Users can update their own print queue" ON public.print_queue TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
