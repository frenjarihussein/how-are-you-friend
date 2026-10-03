CREATE TABLE public.recurring_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'USD',
  debit_account_id uuid NOT NULL REFERENCES public.accounts(id),
  credit_account_id uuid NOT NULL REFERENCES public.accounts(id),
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  next_date date NOT NULL DEFAULT current_date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  job_title text,
  phone text,
  hire_date date,
  base_salary numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.employee_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  adv_date date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL DEFAULT 0,
  deducted boolean NOT NULL DEFAULT false,
  payroll_month text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month text NOT NULL,
  total_gross numeric NOT NULL DEFAULT 0,
  total_advances numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['recurring_entries','employees','employee_advances','payroll_runs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s read" ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())', t, t);
    EXECUTE format('CREATE POLICY "%s insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s update" ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s delete" ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id())', t, t);
  END LOOP;
END $$;
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS last_backup_at timestamptz, ADD COLUMN IF NOT EXISTS backup_every_days integer NOT NULL DEFAULT 7;