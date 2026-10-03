-- Employee extended fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id);

-- Recurring entries: approval mode (auto = post automatically, approval = wait for accountant)
ALTER TABLE public.recurring_entries
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'approval';

-- Employee leaves
CREATE TABLE IF NOT EXISTS public.employee_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'annual',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_leaves TO authenticated;
GRANT ALL ON public.employee_leaves TO service_role;
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_leaves_select ON public.employee_leaves FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY employee_leaves_insert ON public.employee_leaves FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY employee_leaves_update ON public.employee_leaves FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY employee_leaves_delete ON public.employee_leaves FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id());

-- Employee adjustments (deductions & bonuses)
CREATE TABLE IF NOT EXISTS public.employee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  adj_date date NOT NULL,
  kind text NOT NULL DEFAULT 'deduction',
  amount numeric NOT NULL DEFAULT 0,
  applied boolean NOT NULL DEFAULT false,
  payroll_month text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_adjustments TO authenticated;
GRANT ALL ON public.employee_adjustments TO service_role;
ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_adjustments_select ON public.employee_adjustments FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY employee_adjustments_insert ON public.employee_adjustments FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY employee_adjustments_update ON public.employee_adjustments FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY employee_adjustments_delete ON public.employee_adjustments FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id());

-- Scheduled cloud backups
CREATE TABLE IF NOT EXISTS public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY backups_select ON public.backups FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY backups_insert ON public.backups FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY backups_delete ON public.backups FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());