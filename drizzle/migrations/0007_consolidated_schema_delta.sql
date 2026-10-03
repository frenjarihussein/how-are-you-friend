-- Schema additions first (functions below reference these columns)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_auditor boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.audit_log(tenant_id, created_at DESC);
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited boolean NOT NULL DEFAULT false;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited_at timestamptz;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited_by uuid;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS settles_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS fx_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retained_earnings_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salaries_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advances_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_adjust_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_method text NOT NULL DEFAULT 'avg' CHECK (cost_method IN ('avg','fifo','last')),
  ADD COLUMN IF NOT EXISTS fiscal_start date,
  ADD COLUMN IF NOT EXISTS fiscal_end date,
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS closed_until date,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_backup boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  symbol text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- Helper functions (consolidated versions)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.tenant_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR public.current_tenant_id() IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;
CREATE OR REPLACE FUNCTION public.is_auditor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_auditor FROM public.profiles WHERE id = auth.uid()), false)
$$;
CREATE OR REPLACE FUNCTION public.is_auditor_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_auditor() OR public.is_tenant_admin() OR public.is_super_admin()
$$;
CREATE OR REPLACE FUNCTION public.has_perm(_module text, _action perm_action)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR (public.tenant_active() AND (
    (public.is_auditor() AND _action = 'view') OR
    (public.is_tenant_admin() AND NOT EXISTS (SELECT 1 FROM public.tenant_features f WHERE f.tenant_id = public.current_tenant_id() AND f.module = _module AND NOT f.enabled)) OR
    EXISTS (SELECT 1 FROM public.user_permissions p
      WHERE p.user_id = auth.uid() AND p.module = _module
        AND CASE _action WHEN 'view' THEN p.can_view WHEN 'create' THEN p.can_create
          WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete END)))
$$;

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; t uuid;
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  BEGIN t := (r->>'tenant_id')::uuid; EXCEPTION WHEN others THEN t := NULL; END;
  IF TG_TABLE_NAME = 'tenants' THEN t := (r->>'id')::uuid; END IF;
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, record_id, action, old_data, new_data)
  VALUES (t, auth.uid(), TG_TABLE_NAME, r->>'id', TG_OP,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.grant_default_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m text;
BEGIN
  IF NEW.tenant_id IS NULL OR NOT NEW.is_tenant_admin THEN RETURN NEW; END IF;
  FOREACH m IN ARRAY ARRAY['accounts','journal','documents','partners','cheques','assets','products','warehouses','stock','projects','payroll','reports','users','audit'] LOOP
    INSERT INTO public.user_permissions (tenant_id, user_id, module, can_view, can_create, can_edit, can_delete)
    VALUES (NEW.tenant_id, NEW.id, m, true, true, true, true)
    ON CONFLICT (user_id, module) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id IS NULL OR tenant_id = public.my_tenant_id());
CREATE POLICY notif_write ON public.notifications FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY currencies_sel ON public.currencies FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('accounts', 'view')));
CREATE POLICY currencies_ins ON public.currencies FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_perm('accounts', 'create'));
CREATE POLICY currencies_upd ON public.currencies FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_perm('accounts', 'edit'))
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY currencies_del ON public.currencies FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_perm('accounts', 'delete'));
CREATE TRIGGER trg_audit_currencies AFTER INSERT OR UPDATE OR DELETE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP POLICY IF EXISTS ts_ins ON public.tenant_settings;
DROP POLICY IF EXISTS ts_upd ON public.tenant_settings;
CREATE POLICY ts_ins ON public.tenant_settings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND (public.is_tenant_admin() OR public.has_perm('accounts','edit')));
CREATE POLICY ts_upd ON public.tenant_settings FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.is_tenant_admin() OR public.has_perm('accounts','edit')))
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TRIGGER trg_audit_tenant_settings AFTER INSERT OR UPDATE OR DELETE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER trg_audit_user_permissions AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- stock triggers are replaced by the BEFORE-based trg_stock_move in the functions migration
DROP TRIGGER IF EXISTS trg_apply_stock_move ON public.stock_moves;
DROP TRIGGER IF EXISTS trg_revert_stock_move ON public.stock_moves;