CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('document','journal_entry')),
  entity_id uuid NOT NULL,
  attach_type text NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attach_entity ON public.attachments(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.attach_module(_t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN _t = 'document' THEN 'documents' ELSE 'journal' END
$$;

CREATE POLICY att_sel ON public.attachments FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm(public.attach_module(entity_type),'view')));
CREATE POLICY att_ins ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND (public.has_perm(public.attach_module(entity_type),'create') OR public.has_perm(public.attach_module(entity_type),'edit')));
CREATE POLICY att_upd ON public.attachments FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_perm(public.attach_module(entity_type),'edit'))
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY att_del ON public.attachments FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_perm(public.attach_module(entity_type),'delete'));
CREATE TRIGGER trg_audit_attachments AFTER INSERT OR UPDATE OR DELETE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Storage: files live under "<tenant_id>/..."
CREATE POLICY "att files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.current_tenant_id()::text));
CREATE POLICY "att files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = public.current_tenant_id()::text);
CREATE POLICY "att files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = public.current_tenant_id()::text);

-- include attachments in company wipe
CREATE OR REPLACE FUNCTION public.purge_attachments_on_clear() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN DELETE FROM attachments WHERE tenant_id = OLD.id; RETURN OLD; END $$;
REVOKE EXECUTE ON FUNCTION public.purge_attachments_on_clear() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_purge_attachments BEFORE DELETE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.purge_attachments_on_clear();