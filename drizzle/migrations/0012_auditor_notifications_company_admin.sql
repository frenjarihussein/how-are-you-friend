ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_auditor boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited boolean NOT NULL DEFAULT false;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited_by uuid;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS audited_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_auditor_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_auditor OR is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;

DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND (public.has_perm('audit','view') OR public.is_auditor_or_admin())));

CREATE OR REPLACE FUNCTION public.set_entry_audited(_id uuid, _ok boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.journal_entries WHERE id = _id;
  IF t IS NULL OR t <> public.current_tenant_id() OR NOT public.is_auditor_or_admin() THEN
    RAISE EXCEPTION 'لا تملك صلاحية التدقيق';
  END IF;
  UPDATE public.journal_entries SET audited = _ok,
    audited_by = CASE WHEN _ok THEN auth.uid() END,
    audited_at = CASE WHEN _ok THEN now() END
  WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid := public.current_tenant_id();
BEGIN
  IF t IS NULL OR NOT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'فقط مدير الشركة يمكنه تعديل بيانات الشركة';
  END IF;
  IF COALESCE(trim(_name),'') = '' THEN RAISE EXCEPTION 'اسم الشركة مطلوب'; END IF;
  UPDATE public.tenants SET name = _name, code = NULLIF(_code,''), phone = NULLIF(_phone,''),
    address = NULLIF(_address,''), notes = NULLIF(_notes,'') WHERE id = t;
END $$;

-- Purge bypass for company deletion
CREATE OR REPLACE FUNCTION public.block_delete_with_history()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n bigint := 0;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'accounts' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE account_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE account_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.accounts WHERE parent_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'products' THEN
    SELECT count(*) INTO n FROM public.stock_moves WHERE product_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.document_lines WHERE product_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'partners' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE partner_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.stock_moves WHERE partner_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE partner_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE project_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.stock_moves WHERE project_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE project_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'warehouses' THEN
    SELECT count(*) INTO n FROM public.stock_moves WHERE warehouse_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE warehouse_id = OLD.id OR to_warehouse_id = OLD.id; END IF;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'لا يمكن حذف هذه البطاقة لوجود حركات تاريخية مرتبطة بها (%). يمكنك إلغاء تفعيلها بدلاً من الحذف.', n;
  END IF;
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.document_lines_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s text;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  SELECT status INTO s FROM public.documents WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF s = 'posted' THEN RAISE EXCEPTION 'لا يمكن تعديل بنود مستند مرحّل'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.documents_before()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_no IS NULL THEN
      SELECT COALESCE(MAX(doc_no),0)+1 INTO NEW.doc_no FROM public.documents
       WHERE tenant_id = NEW.tenant_id AND doc_type = NEW.doc_type;
    END IF;
    NEW.status := 'draft'; NEW.journal_entry_id := NULL;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF current_setting('app.purge', true) = 'on' THEN RETURN NEW; END IF;
    IF OLD.status = 'posted' AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'لا يمكن تعديل مستند مرحّل، ألغِ الترحيل أولاً';
    END IF;
    IF NEW.status <> OLD.status AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'استخدم زر الترحيل لتغيير حالة المستند';
    END IF;
    RETURN NEW;
  ELSE
    IF current_setting('app.purge', true) = 'on' THEN RETURN OLD; END IF;
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'لا يمكن حذف مستند مرحّل، ألغِ الترحيل أولاً'; END IF;
    RETURN OLD;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.audit_row()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; t uuid;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  BEGIN t := (r->>'tenant_id')::uuid; EXCEPTION WHEN others THEN t := NULL; END;
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, record_id, action, old_data, new_data)
  VALUES (t, auth.uid(), TG_TABLE_NAME, r->>'id', TG_OP,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_tenant(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.purge', 'on', true);
  UPDATE public.documents SET journal_entry_id = NULL WHERE tenant_id = _id;
  UPDATE public.journal_entries SET document_id = NULL WHERE tenant_id = _id;
  DELETE FROM public.journal_lines WHERE tenant_id = _id;
  DELETE FROM public.stock_moves WHERE tenant_id = _id;
  DELETE FROM public.document_lines WHERE tenant_id = _id;
  DELETE FROM public.documents WHERE tenant_id = _id;
  DELETE FROM public.journal_entries WHERE tenant_id = _id;
  DELETE FROM public.cheques WHERE tenant_id = _id;
  DELETE FROM public.boq_items WHERE tenant_id = _id;
  DELETE FROM public.project_expenses WHERE tenant_id = _id;
  DELETE FROM public.project_milestones WHERE tenant_id = _id;
  DELETE FROM public.projects WHERE tenant_id = _id;
  DELETE FROM public.fixed_assets WHERE tenant_id = _id;
  DELETE FROM public.banks WHERE tenant_id = _id;
  DELETE FROM public.partners WHERE tenant_id = _id;
  UPDATE public.products SET default_warehouse_id = NULL WHERE tenant_id = _id;
  DELETE FROM public.products WHERE tenant_id = _id;
  DELETE FROM public.warehouses WHERE tenant_id = _id;
  DELETE FROM public.exchange_rates WHERE tenant_id = _id;
  DELETE FROM public.tenant_settings WHERE tenant_id = _id;
  UPDATE public.accounts SET parent_id = NULL WHERE tenant_id = _id;
  DELETE FROM public.accounts WHERE tenant_id = _id;
  DELETE FROM public.user_permissions WHERE tenant_id = _id;
  DELETE FROM public.profiles WHERE tenant_id = _id;
  DELETE FROM public.tenant_features WHERE tenant_id = _id;
  DELETE FROM public.tenant_payments WHERE tenant_id = _id;
  DELETE FROM public.subscription_history WHERE tenant_id = _id;
  DELETE FROM public.audit_log WHERE tenant_id = _id;
  DELETE FROM public.tenants WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.purge_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_tenant(uuid) TO service_role;