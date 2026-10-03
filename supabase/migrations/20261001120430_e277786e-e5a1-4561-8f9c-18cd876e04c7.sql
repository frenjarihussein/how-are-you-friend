
CREATE TYPE public.perm_action AS ENUM ('view','create','edit','delete');
CREATE TYPE public.account_nature AS ENUM ('closing','balance_sheet','profit_loss');

-- ===== Companies =====
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','monthly','yearly','custom')),
  sub_start date NOT NULL DEFAULT current_date,
  sub_end date NOT NULL DEFAULT (current_date + 30),
  max_users integer NOT NULL DEFAULT 5,
  subscription_fee numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, module)
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  email text,
  is_super_admin boolean NOT NULL DEFAULT false,
  is_tenant_admin boolean NOT NULL DEFAULT false,
  is_auditor boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notif_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, module)
);
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid,
  user_id uuid,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant ON public.audit_log(tenant_id, created_at DESC);
CREATE TABLE public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tenant_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pay_date date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.tenant_features, public.profiles, public.user_permissions,
  public.subscription_history, public.tenant_payments, public.notifications TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.tenants, public.tenant_features, public.profiles, public.user_permissions, public.audit_log,
  public.subscription_history, public.tenant_payments, public.notifications TO service_role;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.tenant_id FROM public.profiles p JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = auth.uid() AND p.is_active AND t.is_active AND t.sub_end >= current_date
$$;
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
CREATE OR REPLACE FUNCTION public.claim_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

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
CREATE TRIGGER trg_profiles_default_perms AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_default_permissions();

-- ===== RLS: core =====
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.my_tenant_id());
CREATE POLICY tenants_write ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY tf_select ON public.tenant_features FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.my_tenant_id());
CREATE POLICY tf_write ON public.tenant_features FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin() OR tenant_id = public.current_tenant_id());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit') AND id <> auth.uid()))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND is_super_admin = false));
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_super_admin());

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY up_select ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR tenant_id = public.current_tenant_id());
CREATE POLICY up_write ON public.user_permissions FOR ALL TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit')))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('users','edit')));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('audit','view')));

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY sh_select ON public.subscription_history FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.my_tenant_id());
CREATE POLICY sh_write ON public.subscription_history FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tp_all ON public.tenant_payments FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id IS NULL OR tenant_id = public.my_tenant_id());
CREATE POLICY notif_write ON public.notifications FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ===== Accounting =====
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  nature public.account_nature NOT NULL DEFAULT 'balance_sheet',
  currency text NOT NULL DEFAULT 'USD',
  is_group boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  symbol text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rate_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL DEFAULT 'SYP',
  rate_to_usd numeric(18,6) NOT NULL CHECK (rate_to_usd > 0),
  UNIQUE (tenant_id, rate_date, currency)
);
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  partner_type text NOT NULL DEFAULT 'customer' CHECK (partner_type IN ('customer','supplier','both')),
  phone text,
  address text,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_no integer NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  description text,
  currency text NOT NULL DEFAULT 'USD',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  doc_type text NOT NULL DEFAULT 'journal',
  document_id uuid,
  audited boolean NOT NULL DEFAULT false,
  audited_at timestamptz,
  audited_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_no)
);
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  project_id uuid,
  description text,
  debit numeric(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX idx_lines_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_lines_account ON public.journal_lines(account_id);

CREATE OR REPLACE FUNCTION public.check_entry_balanced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eid uuid; d numeric; c numeric;
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN RETURN NULL; END IF;
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = eid) THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM public.journal_lines WHERE entry_id = eid;
  IF d <> c THEN
    RAISE EXCEPTION 'القيد غير متوازن: مجموع المدين % لا يساوي مجموع الدائن %', d, c;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_entry_balanced();

CREATE TABLE public.banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  branch text,
  account_no text,
  currency text NOT NULL DEFAULT 'USD',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cheque_no text NOT NULL,
  direction text NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming','outgoing')),
  bank_id uuid REFERENCES public.banks(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','returned','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  purchase_date date NOT NULL DEFAULT current_date,
  cost numeric(18,4) NOT NULL CHECK (cost >= 0),
  salvage_value numeric(18,4) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_years integer NOT NULL DEFAULT 5 CHECK (useful_life_years > 0),
  currency text NOT NULL DEFAULT 'USD',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- ===== Stock & projects =====
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku text NOT NULL,
  barcode text,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'قطعة',
  category text,
  reorder_level numeric(18,4) NOT NULL DEFAULT 0,
  default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  last_purchase_price numeric(18,4) NOT NULL DEFAULT 0,
  avg_cost numeric(18,4) NOT NULL DEFAULT 0,
  qty_on_hand numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  client_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  contract_value numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  start_date date,
  end_date date,
  completion_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (completion_pct >= 0 AND completion_pct <= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','closed')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_project_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE TABLE public.boq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  unit text,
  qty numeric(18,4) NOT NULL DEFAULT 0,
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT current_date,
  description text NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  due_date date,
  amount numeric(18,4) NOT NULL DEFAULT 0,
  is_done boolean NOT NULL DEFAULT false,
  invoiced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Settings =====
CREATE TABLE public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  customers_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  suppliers_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  inventory_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  sales_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  cogs_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  project_cost_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  fx_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  retained_earnings_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  salaries_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  advances_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  inventory_adjust_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  cost_method text NOT NULL DEFAULT 'avg' CHECK (cost_method IN ('avg','fifo','last')),
  fiscal_start date,
  fiscal_end date,
  period_type text NOT NULL DEFAULT 'yearly',
  closed_until date,
  logo_url text,
  primary_color text,
  onboarding_done boolean NOT NULL DEFAULT false,
  auto_backup boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ts_select ON public.tenant_settings FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());
CREATE POLICY ts_ins ON public.tenant_settings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND (public.is_tenant_admin() OR public.has_perm('accounts','edit')));
CREATE POLICY ts_upd ON public.tenant_settings FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.is_tenant_admin() OR public.has_perm('accounts','edit')))
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ===== Documents =====
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('sale','purchase','receipt','payment','transfer','stock_in','stock_out')),
  doc_no integer,
  doc_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL DEFAULT 'USD',
  exchange_rate numeric NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  partner_id uuid REFERENCES public.partners(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  to_warehouse_id uuid REFERENCES public.warehouses(id),
  project_id uuid REFERENCES public.projects(id),
  account_id uuid REFERENCES public.accounts(id),
  settles_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_type, doc_no)
);
CREATE TABLE public.document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric NOT NULL CHECK (qty > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.journal_entries ADD CONSTRAINT je_document_fk FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE TABLE public.stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  move_date date NOT NULL DEFAULT current_date,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  unit_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_moves_product ON public.stock_moves(product_id);

-- ===== Generic tenant policies + change-log triggers =====
DO $do$
DECLARE t text; m text; tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts:accounts','currencies:accounts','exchange_rates:accounts','partners:partners',
    'journal_entries:journal','journal_lines:journal','banks:cheques','cheques:cheques','fixed_assets:assets',
    'warehouses:warehouses','products:products','stock_moves:stock','projects:projects','boq_items:projects',
    'project_expenses:projects','project_milestones:projects','documents:documents','document_lines:documents'] LOOP
    t := split_part(tbl, ':', 1);
    m := split_part(tbl, ':', 2);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY %1$s_sel ON public.%1$I FOR SELECT TO authenticated
      USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'view')))$f$, t, m);
    EXECUTE format($f$CREATE POLICY %1$s_ins ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'create'))$f$, t, m);
    EXECUTE format($f$CREATE POLICY %1$s_upd ON public.%1$I FOR UPDATE TO authenticated
      USING (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'edit'))
      WITH CHECK (tenant_id = public.current_tenant_id())$f$, t, m);
    EXECUTE format($f$CREATE POLICY %1$s_del ON public.%1$I FOR DELETE TO authenticated
      USING (tenant_id = public.current_tenant_id() AND public.has_perm(%2$L, 'delete'))$f$, t, m);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row()', t);
  END LOOP;
END
$do$;
CREATE TRIGGER trg_audit_tenants AFTER INSERT OR UPDATE OR DELETE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER trg_audit_tenant_settings AFTER INSERT OR UPDATE OR DELETE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER trg_audit_user_permissions AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row();
