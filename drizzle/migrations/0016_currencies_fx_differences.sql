CREATE TABLE public.currencies (
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
CREATE POLICY "currencies read" ON public.currencies FOR SELECT TO authenticated
  USING (public.is_super_admin() OR tenant_id = public.current_tenant_id());
CREATE POLICY "currencies write" ON public.currencies FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('accounts','edit')));
CREATE POLICY "currencies delete" ON public.currencies FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_perm('accounts','edit')));

CREATE OR REPLACE FUNCTION public.add_currency(_code text, _name text, _symbol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := public.current_tenant_id(); c text := upper(trim(_code));
BEGIN
  IF t IS NULL OR NOT public.has_perm('accounts','edit') THEN RAISE EXCEPTION 'لا تملك صلاحية إضافة العملات'; END IF;
  IF c !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'رمز العملة يجب أن يكون 3 أحرف لاتينية مثل EUR'; END IF;
  EXECUTE format('ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS %L', c);
  INSERT INTO public.currencies (tenant_id, code, name, symbol) VALUES (t, c, _name, NULLIF(_symbol,''))
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;
END $$;
GRANT EXECUTE ON FUNCTION public.add_currency(text,text,text) TO authenticated;

ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS fx_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS settles_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.post_document(_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  d record; s record; l record; p record; inv record;
  total numeric := 0; cost_usd numeric := 0; cost_doc numeric; rate numeric; fx numeric; fxid uuid;
  eid uuid; eno int; wh_cost numeric; lbl text; acc uuid;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT public.is_super_admin() AND (d.tenant_id <> public.current_tenant_id() OR NOT public.has_perm('documents','edit')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية ترحيل المستندات';
  END IF;
  IF d.status = 'posted' THEN RAISE EXCEPTION 'المستند مرحّل مسبقاً'; END IF;
  SELECT * INTO s FROM public.tenant_settings WHERE tenant_id = d.tenant_id;
  rate := CASE WHEN d.currency = 'USD' THEN 1 ELSE d.exchange_rate END;

  lbl := CASE d.doc_type WHEN 'sale' THEN 'فاتورة مبيع' WHEN 'purchase' THEN 'فاتورة شراء'
    WHEN 'receipt' THEN 'سند قبض' WHEN 'payment' THEN 'سند دفع' WHEN 'transfer' THEN 'مناقلة'
    WHEN 'stock_in' THEN 'إدخال مستودع' ELSE 'إخراج إلى مشروع' END || ' رقم ' || d.doc_no;

  IF d.doc_type IN ('sale','purchase','transfer','stock_in','stock_out') THEN
    IF NOT EXISTS (SELECT 1 FROM public.document_lines WHERE document_id = _id) THEN
      RAISE EXCEPTION 'المستند لا يحتوي على بنود';
    END IF;
    IF d.warehouse_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المستودع'; END IF;
    SELECT COALESCE(SUM(qty*unit_price),0) INTO total FROM public.document_lines WHERE document_id = _id;
  ELSE
    total := d.amount;
    IF total <= 0 THEN RAISE EXCEPTION 'يجب إدخال المبلغ'; END IF;
  END IF;

  IF d.doc_type IN ('sale','purchase','receipt','payment') AND d.partner_id IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد الزبون أو المورد';
  END IF;
  IF d.doc_type = 'transfer' AND (d.to_warehouse_id IS NULL OR d.to_warehouse_id = d.warehouse_id) THEN
    RAISE EXCEPTION 'يجب تحديد مستودع وجهة مختلف';
  END IF;
  IF d.doc_type = 'stock_out' AND d.project_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المشروع'; END IF;

  PERFORM set_config('app.posting', 'on', true);

  FOR l IN SELECT * FROM public.document_lines WHERE document_id = _id LOOP
    SELECT * INTO p FROM public.products WHERE id = l.product_id;
    IF d.doc_type IN ('purchase','stock_in') THEN
      INSERT INTO public.stock_moves (tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, project_id, partner_id, reference, document_id)
      VALUES (d.tenant_id, l.product_id, d.warehouse_id, d.doc_date, 'in', l.qty, round(l.unit_price / rate, 4), d.project_id, d.partner_id, lbl, _id);
    ELSIF d.doc_type IN ('sale','stock_out','transfer') THEN
      wh_cost := COALESCE(NULLIF(p.avg_cost,0), NULLIF(p.last_purchase_price,0), CASE WHEN d.doc_type <> 'sale' THEN round(l.unit_price / rate, 4) END, 0);
      INSERT INTO public.stock_moves (tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, project_id, partner_id, reference, document_id)
      VALUES (d.tenant_id, l.product_id, d.warehouse_id, d.doc_date, 'out', l.qty, wh_cost, d.project_id, d.partner_id, lbl, _id);
      cost_usd := cost_usd + l.qty * wh_cost;
      IF d.doc_type = 'transfer' THEN
        INSERT INTO public.stock_moves (tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, project_id, partner_id, reference, document_id)
        VALUES (d.tenant_id, l.product_id, d.to_warehouse_id, d.doc_date, 'in', l.qty, wh_cost, NULL, NULL, lbl, _id);
      END IF;
    END IF;
  END LOOP;

  IF d.doc_type = 'transfer' THEN
    UPDATE public.documents SET status = 'posted' WHERE id = _id;
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(entry_no),0)+1 INTO eno FROM public.journal_entries WHERE tenant_id = d.tenant_id;
  INSERT INTO public.journal_entries (tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by, document_id)
  VALUES (d.tenant_id, eno, d.doc_date, COALESCE(lbl || ' - ' || NULLIF(d.notes,''), lbl), d.currency, rate, d.doc_type, auth.uid(), _id)
  RETURNING id INTO eid;
  cost_doc := round(cost_usd * rate, 2);
  total := round(total, 2);

  IF d.doc_type = 'sale' THEN
    IF s.customers_account_id IS NULL OR s.sales_account_id IS NULL THEN RAISE EXCEPTION 'حدد حسابات الزبائن والمبيعات في إعدادات الحسابات'; END IF;
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, project_id, description, debit, credit) VALUES
      (d.tenant_id, eid, s.customers_account_id, d.partner_id, NULL, lbl, total, 0),
      (d.tenant_id, eid, s.sales_account_id, NULL, d.project_id, lbl, 0, total);
    IF cost_doc > 0 THEN
      IF s.cogs_account_id IS NULL OR s.inventory_account_id IS NULL THEN RAISE EXCEPTION 'حدد حسابي تكلفة المبيعات والمخزون في الإعدادات'; END IF;
      INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, project_id, description, debit, credit) VALUES
        (d.tenant_id, eid, s.cogs_account_id, d.project_id, 'تكلفة ' || lbl, cost_doc, 0),
        (d.tenant_id, eid, s.inventory_account_id, NULL, 'تكلفة ' || lbl, 0, cost_doc);
    END IF;
  ELSIF d.doc_type = 'purchase' THEN
    IF s.inventory_account_id IS NULL OR s.suppliers_account_id IS NULL THEN RAISE EXCEPTION 'حدد حسابي المخزون والموردين في الإعدادات'; END IF;
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, project_id, description, debit, credit) VALUES
      (d.tenant_id, eid, s.inventory_account_id, NULL, NULL, lbl, total, 0),
      (d.tenant_id, eid, s.suppliers_account_id, d.partner_id, NULL, lbl, 0, total);
  ELSIF d.doc_type IN ('receipt','payment') THEN
    acc := COALESCE(d.account_id, s.cash_account_id);
    IF acc IS NULL THEN RAISE EXCEPTION 'حدد حساب الصندوق أو المصرف'; END IF;
    IF d.doc_type = 'receipt' THEN
      IF s.customers_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الزبائن في الإعدادات'; END IF;
      INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, project_id, description, debit, credit) VALUES
        (d.tenant_id, eid, acc, NULL, NULL, lbl, total, 0),
        (d.tenant_id, eid, s.customers_account_id, d.partner_id, d.project_id, lbl, 0, total);
    ELSE
      IF s.suppliers_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الموردين في الإعدادات'; END IF;
      INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, project_id, description, debit, credit) VALUES
        (d.tenant_id, eid, s.suppliers_account_id, d.partner_id, d.project_id, lbl, total, 0),
        (d.tenant_id, eid, acc, NULL, NULL, lbl, 0, total);
    END IF;

    -- Exchange difference against the settled invoice (booked in USD).
    IF d.settles_document_id IS NOT NULL THEN
      SELECT * INTO inv FROM public.documents WHERE id = d.settles_document_id AND tenant_id = d.tenant_id;
      IF inv.id IS NOT NULL AND inv.currency = d.currency AND d.currency <> 'USD'
         AND inv.exchange_rate > 0 AND rate > 0 AND inv.exchange_rate <> rate THEN
        fx := round(total / inv.exchange_rate - total / rate, 2);
        IF fx <> 0 THEN
          IF s.fx_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب فروق أسعار الصرف في إعدادات الحساب'; END IF;
          INSERT INTO public.journal_entries (tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by, document_id)
          VALUES (d.tenant_id, eno + 1, d.doc_date, 'فروق أسعار صرف - ' || lbl, 'USD', 1, d.doc_type, auth.uid(), _id)
          RETURNING id INTO fxid;
          IF d.doc_type = 'receipt' THEN
            INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, description, debit, credit) VALUES
              (d.tenant_id, fxid, s.fx_account_id, NULL, 'فروق أسعار صرف', greatest(fx,0), greatest(-fx,0)),
              (d.tenant_id, fxid, s.customers_account_id, d.partner_id, 'فروق أسعار صرف', greatest(-fx,0), greatest(fx,0));
          ELSE
            INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, description, debit, credit) VALUES
              (d.tenant_id, fxid, s.suppliers_account_id, d.partner_id, 'فروق أسعار صرف', greatest(fx,0), greatest(-fx,0)),
              (d.tenant_id, fxid, s.fx_account_id, NULL, 'فروق أسعار صرف', greatest(-fx,0), greatest(fx,0));
          END IF;
        END IF;
      END IF;
    END IF;
  ELSIF d.doc_type = 'stock_in' THEN
    acc := COALESCE(d.account_id, s.suppliers_account_id);
    IF s.inventory_account_id IS NULL OR acc IS NULL THEN RAISE EXCEPTION 'حدد حساب المخزون والحساب المقابل'; END IF;
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, partner_id, project_id, description, debit, credit) VALUES
      (d.tenant_id, eid, s.inventory_account_id, NULL, NULL, lbl, total, 0),
      (d.tenant_id, eid, acc, d.partner_id, NULL, lbl, 0, total);
  ELSIF d.doc_type = 'stock_out' THEN
    IF s.inventory_account_id IS NULL OR s.project_cost_account_id IS NULL THEN RAISE EXCEPTION 'حدد حسابي المخزون وتكاليف المشاريع في الإعدادات'; END IF;
    IF cost_doc > 0 THEN
      INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, project_id, description, debit, credit) VALUES
        (d.tenant_id, eid, s.project_cost_account_id, d.project_id, lbl, cost_doc, 0),
        (d.tenant_id, eid, s.inventory_account_id, NULL, lbl, 0, cost_doc);
    END IF;
  END IF;

  UPDATE public.documents SET status = 'posted', journal_entry_id = eid WHERE id = _id;
  RETURN eid;
END $function$;