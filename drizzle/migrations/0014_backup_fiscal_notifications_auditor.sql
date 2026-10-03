ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS fiscal_start date,
  ADD COLUMN IF NOT EXISTS fiscal_end date,
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS retained_earnings_account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS closed_until date,
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id IS NULL OR tenant_id = public.current_tenant_id());
CREATE POLICY notif_write ON public.notifications FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.profiles SET notif_seen_at = now() WHERE id = auth.uid() $$;

-- Auditors can view every module of their company
CREATE OR REPLACE FUNCTION public.has_perm(_module text, _action perm_action)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
  OR (_action = 'view' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_auditor AND is_active))
  OR EXISTS (
    SELECT 1 FROM public.user_permissions p
    WHERE p.user_id = auth.uid() AND p.module = _module
      AND CASE _action
        WHEN 'view' THEN p.can_view WHEN 'create' THEN p.can_create
        WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete END
  )
$function$;

-- Audited entries are locked; closed periods are locked
CREATE OR REPLACE FUNCTION public.journal_entries_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE cu date;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.audited THEN
    IF TG_OP = 'DELETE' OR (NEW.audited AND current_setting('app.auditing', true) IS DISTINCT FROM 'on') THEN
      RAISE EXCEPTION 'لا يمكن تعديل أو حذف قيد مدقق، يجب إلغاء التدقيق أولاً';
    END IF;
  END IF;
  SELECT closed_until INTO cu FROM public.tenant_settings WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF cu IS NOT NULL AND current_setting('app.closing', true) IS DISTINCT FROM 'on'
     AND current_setting('app.auditing', true) IS DISTINCT FROM 'on' THEN
    IF (TG_OP <> 'INSERT' AND OLD.entry_date <= cu) OR (TG_OP <> 'DELETE' AND NEW.entry_date <= cu) THEN
      RAISE EXCEPTION 'الفترة المالية حتى % مقفلة، لا يمكن إضافة أو تعديل قيود فيها', cu;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_journal_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_guard();

CREATE OR REPLACE FUNCTION public.journal_lines_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id) AND audited) THEN
    RAISE EXCEPTION 'لا يمكن تعديل بنود قيد مدقق';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_journal_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.journal_lines_guard();

CREATE OR REPLACE FUNCTION public.set_entry_audited(_id uuid, _ok boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.journal_entries WHERE id = _id;
  IF t IS NULL OR t <> public.current_tenant_id() OR NOT public.is_auditor_or_admin() THEN
    RAISE EXCEPTION 'لا تملك صلاحية التدقيق';
  END IF;
  PERFORM set_config('app.auditing', 'on', true);
  UPDATE public.journal_entries SET audited = _ok,
    audited_by = CASE WHEN _ok THEN auth.uid() END,
    audited_at = CASE WHEN _ok THEN now() END
  WHERE id = _id;
END $function$;

-- Restore support: triggers honor app.purge
CREATE OR REPLACE FUNCTION public.apply_stock_move()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p record; new_qty numeric; new_cost numeric; wh_qty numeric;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF NEW.direction = 'in' THEN
    new_qty := p.qty_on_hand + NEW.qty;
    new_cost := CASE WHEN new_qty > 0
      THEN ((GREATEST(p.qty_on_hand,0) * p.avg_cost) + (NEW.qty * NEW.unit_cost)) / new_qty
      ELSE NEW.unit_cost END;
    UPDATE public.products
      SET qty_on_hand = new_qty, avg_cost = round(new_cost, 4), last_purchase_price = NEW.unit_cost
      WHERE id = p.id;
  ELSE
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END), 0) INTO wh_qty
      FROM public.stock_moves WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id AND id <> NEW.id;
    IF wh_qty - NEW.qty < 0 THEN
      RAISE EXCEPTION 'الكمية غير كافية في المستودع: الرصيد المتاح % والمطلوب %', wh_qty, NEW.qty;
    END IF;
    UPDATE public.products SET qty_on_hand = p.qty_on_hand - NEW.qty WHERE id = p.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_stock_move()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN RETURN OLD; END IF;
  UPDATE public.products
    SET qty_on_hand = qty_on_hand + CASE WHEN OLD.direction = 'in' THEN -OLD.qty ELSE OLD.qty END
    WHERE id = OLD.product_id;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_entry_balanced()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE eid uuid; d numeric; c numeric;
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN RETURN NULL; END IF;
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = eid) THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM public.journal_lines WHERE entry_id = eid;
  IF d <> c THEN
    RAISE EXCEPTION 'القيد غير متوازن: مجموع المدين % لا يساوي مجموع الدائن %', d, c;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.documents_before()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_no IS NULL THEN
      SELECT COALESCE(MAX(doc_no),0)+1 INTO NEW.doc_no FROM public.documents
       WHERE tenant_id = NEW.tenant_id AND doc_type = NEW.doc_type;
    END IF;
    NEW.status := 'draft'; NEW.journal_entry_id := NULL;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'لا يمكن تعديل مستند مرحّل، ألغِ الترحيل أولاً';
    END IF;
    IF NEW.status <> OLD.status AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'استخدم زر الترحيل لتغيير حالة المستند';
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'لا يمكن حذف مستند مرحّل، ألغِ الترحيل أولاً'; END IF;
    RETURN OLD;
  END IF;
END $function$;

-- Restore a company's data from a backup (JSON object: table -> rows)
CREATE OR REPLACE FUNCTION public.restore_tenant(_id uuid, _data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE tbl text; rows jsonb;
  order_list text[] := ARRAY['accounts','exchange_rates','warehouses','products','partners','banks','projects',
    'boq_items','project_milestones','project_expenses','cheques','fixed_assets','documents','document_lines',
    'journal_entries','journal_lines','stock_moves'];
BEGIN
  IF NOT (public.is_super_admin() OR (_id = public.current_tenant_id()
      AND COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false))) THEN
    RAISE EXCEPTION 'لا تملك صلاحية استرجاع النسخة الاحتياطية';
  END IF;
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

  FOREACH tbl IN ARRAY order_list LOOP
    rows := COALESCE(_data->tbl, '[]'::jsonb);
    IF jsonb_array_length(rows) = 0 THEN CONTINUE; END IF;
    SELECT jsonb_agg(e || jsonb_build_object('tenant_id', _id)
      || CASE WHEN tbl = 'accounts' THEN jsonb_build_object('parent_id', null)
              WHEN tbl = 'documents' THEN jsonb_build_object('journal_entry_id', null)
              ELSE '{}'::jsonb END)
      INTO rows FROM jsonb_array_elements(rows) e;
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)', tbl, tbl) USING rows;
  END LOOP;

  UPDATE public.accounts a SET parent_id = (e->>'parent_id')::uuid
    FROM jsonb_array_elements(COALESCE(_data->'accounts','[]')) e
    WHERE a.id = (e->>'id')::uuid AND NULLIF(e->>'parent_id','') IS NOT NULL;
  UPDATE public.documents d SET journal_entry_id = (e->>'journal_entry_id')::uuid
    FROM jsonb_array_elements(COALESCE(_data->'documents','[]')) e
    WHERE d.id = (e->>'id')::uuid AND NULLIF(e->>'journal_entry_id','') IS NOT NULL;

  IF jsonb_array_length(COALESCE(_data->'tenant_settings','[]')) > 0 THEN
    INSERT INTO public.tenant_settings
      SELECT * FROM jsonb_populate_record(NULL::public.tenant_settings,
        (_data->'tenant_settings'->0) || jsonb_build_object('tenant_id', _id, 'updated_at', now()));
  END IF;
END $$;

-- Closing entry for a fiscal year and roll to the next year
CREATE OR REPLACE FUNCTION public.close_fiscal_year()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t uuid := public.current_tenant_id(); s record; eid uuid; eno int; r record; net numeric := 0; lbl text;
BEGIN
  IF t IS NULL OR NOT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'فقط مدير الشركة يمكنه إقفال السنة المالية';
  END IF;
  SELECT * INTO s FROM public.tenant_settings WHERE tenant_id = t;
  IF s.fiscal_start IS NULL OR s.fiscal_end IS NULL THEN RAISE EXCEPTION 'حدد بداية ونهاية السنة المالية أولاً'; END IF;
  IF s.retained_earnings_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الأرباح والخسائر (الختامي) في الإعدادات'; END IF;
  PERFORM set_config('app.closing', 'on', true);
  lbl := 'قيد إقفال السنة المالية ' || s.fiscal_start || ' - ' || s.fiscal_end;
  SELECT COALESCE(MAX(entry_no),0)+1 INTO eno FROM public.journal_entries WHERE tenant_id = t;
  INSERT INTO public.journal_entries (tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
  VALUES (t, eno, s.fiscal_end, lbl, 'USD', 1, 'closing', auth.uid()) RETURNING id INTO eid;
  FOR r IN
    SELECT l.account_id, round(SUM((l.debit - l.credit) / NULLIF(e.exchange_rate,0)), 2) AS bal
    FROM public.journal_lines l JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.tenant_id = t AND a.nature = 'profit_loss' AND e.entry_date BETWEEN s.fiscal_start AND s.fiscal_end
    GROUP BY l.account_id HAVING round(SUM((l.debit - l.credit) / NULLIF(e.exchange_rate,0)), 2) <> 0
  LOOP
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, description, debit, credit)
    VALUES (t, eid, r.account_id, lbl, GREATEST(-r.bal,0), GREATEST(r.bal,0));
    net := net + r.bal;
  END LOOP;
  IF net = 0 AND NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE entry_id = eid) THEN
    DELETE FROM public.journal_entries WHERE id = eid; eid := NULL;
  ELSIF net <> 0 THEN
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, description, debit, credit)
    VALUES (t, eid, s.retained_earnings_account_id, 'نتيجة السنة - ' || lbl, GREATEST(net,0), GREATEST(-net,0));
  END IF;
  UPDATE public.tenant_settings SET closed_until = s.fiscal_end,
    fiscal_start = s.fiscal_end + 1,
    fiscal_end = (s.fiscal_end + interval '1 year')::date
  WHERE tenant_id = t;
  RETURN eid;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_fiscal_period()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.current_tenant_id() IS NULL OR NOT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'فقط مدير الشركة';
  END IF;
  UPDATE public.tenant_settings SET closed_until = NULL WHERE tenant_id = public.current_tenant_id();
END $$;