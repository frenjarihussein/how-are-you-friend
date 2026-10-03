CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_unit text,
  factor numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units tenant read" ON public.units FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "units tenant insert" ON public.units FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "units tenant update" ON public.units FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "units tenant delete" ON public.units FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id());

ALTER TABLE public.products ADD COLUMN parent_id uuid REFERENCES public.products(id) ON DELETE SET NULL, ADD COLUMN is_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN parent_id uuid REFERENCES public.projects(id) ON DELETE SET NULL, ADD COLUMN is_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.warehouses ADD COLUMN parent_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL, ADD COLUMN is_group boolean NOT NULL DEFAULT false;