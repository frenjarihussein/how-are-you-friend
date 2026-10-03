CREATE TYPE public.perm_action AS ENUM ('view','create','edit','delete');
CREATE TYPE public.currency_code AS ENUM ('USD','SYP');
CREATE TYPE public.account_nature AS ENUM ('debit','credit');

CREATE OR REPLACE FUNCTION public.has_perm(_module text, _action perm_action)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_permissions p
    WHERE p.user_id = auth.uid() AND p.module = _module
      AND CASE _action
        WHEN 'view' THEN p.can_view
        WHEN 'create' THEN p.can_create
        WHEN 'edit' THEN p.can_edit
        WHEN 'delete' THEN p.can_delete
      END
  )
$$;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_update') THEN
    CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
      USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit') AND id <> auth.uid()))
      WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND is_super_admin = false));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_permissions' AND policyname='up_write') THEN
    CREATE POLICY up_write ON public.user_permissions FOR ALL TO authenticated
      USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit')))
      WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_log' AND policyname='audit_select') THEN
    CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
      USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('audit','view')));
  END IF;
END $do$;

DO $do$
DECLARE t text; m text; tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts:accounts','exchange_rates:accounts','partners:partners',
    'journal_entries:journal','journal_lines:journal','banks:cheques',
    'cheques:cheques','fixed_assets:assets',
    'warehouses:warehouses','products:products','stock_moves:stock',
    'projects:projects','boq_items:projects','project_expenses:projects','project_milestones:projects'] LOOP
    t := split_part(tbl, ':', 1);
    m := split_part(tbl, ':', 2);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_sel') THEN
      EXECUTE format($f$CREATE POLICY %1$s_sel ON public.%1$I FOR SELECT TO authenticated
        USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'view')))$f$, t, m);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_ins') THEN
      EXECUTE format($f$CREATE POLICY %1$s_ins ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'create'))$f$, t, m);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_upd') THEN
      EXECUTE format($f$CREATE POLICY %1$s_upd ON public.%1$I FOR UPDATE TO authenticated
        USING (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'edit'))
        WITH CHECK (tenant_id = public.current_tenant_id())$f$, t, m);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_del') THEN
      EXECUTE format($f$CREATE POLICY %1$s_del ON public.%1$I FOR DELETE TO authenticated
        USING (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'delete'))$f$, t, m);
    END IF;
  END LOOP;
END $do$;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='documents_sel') THEN
    CREATE POLICY documents_sel ON public.documents FOR SELECT TO authenticated USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('documents','view')));
    CREATE POLICY documents_ins ON public.documents FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_perm('documents','create'));
    CREATE POLICY documents_upd ON public.documents FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_perm('documents','edit')) WITH CHECK (tenant_id = public.current_tenant_id());
    CREATE POLICY documents_del ON public.documents FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_perm('documents','delete'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='document_lines' AND policyname='dl_sel') THEN
    CREATE POLICY dl_sel ON public.document_lines FOR SELECT TO authenticated USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('documents','view')));
    CREATE POLICY dl_ins ON public.document_lines FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_perm('documents','create'));
    CREATE POLICY dl_upd ON public.document_lines FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_perm('documents','edit')) WITH CHECK (tenant_id = public.current_tenant_id());
    CREATE POLICY dl_del ON public.document_lines FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id() AND (public.has_perm('documents','edit') OR public.has_perm('documents','delete')));
  END IF;
END $do$;