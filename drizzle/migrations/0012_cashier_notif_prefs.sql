ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'standard'
  CHECK (account_kind IN ('standard','sales_cashier','purchase_cashier','warehouse_keeper'));

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'announcement';

CREATE TABLE IF NOT EXISTS public.user_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notif jsonb,
  dashboard jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_prefs TO authenticated;
GRANT ALL ON public.user_prefs TO service_role;
ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(tenant_id, kind, title, body, created_by) VALUES (_tenant, _kind, _title, _body, auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.emit_notification(uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lbl text;
BEGIN
  IF TG_TABLE_NAME = 'documents' THEN
    lbl := CASE NEW.doc_type WHEN 'sale' THEN 'فاتورة مبيع' WHEN 'purchase' THEN 'فاتورة شراء' WHEN 'receipt' THEN 'سند قبض'
      WHEN 'payment' THEN 'سند دفع' WHEN 'transfer' THEN 'مناقلة' WHEN 'stock_in' THEN 'إدخال مستودع' ELSE 'إخراج مستودع' END;
    IF TG_OP = 'INSERT' AND NEW.doc_type IN ('sale','purchase') THEN
      PERFORM emit_notification(NEW.tenant_id, 'invoice_created', lbl || ' جديدة', 'رقم ' || coalesce(NEW.doc_no::text,'-'));
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
      PERFORM emit_notification(NEW.tenant_id, 'document_posted', 'ترحيل ' || lbl, 'رقم ' || coalesce(NEW.doc_no::text,'-') || ' بمبلغ ' || NEW.amount);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status <> 'posted' THEN
      PERFORM emit_notification(NEW.tenant_id, 'document_posted', 'إلغاء ترحيل ' || lbl, 'رقم ' || coalesce(NEW.doc_no::text,'-'));
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF NEW.audited AND NOT OLD.audited THEN
      PERFORM emit_notification(NEW.tenant_id, 'entry_audited', 'تدقيق قيد', 'القيد رقم ' || NEW.entry_no);
    END IF;
  ELSIF TG_TABLE_NAME = 'payroll_runs' THEN
    PERFORM emit_notification(NEW.tenant_id, 'payroll_posted', 'ترحيل رواتب ' || NEW.month, 'الصافي ' || NEW.total_net);
  ELSIF TG_TABLE_NAME = 'cheques' THEN
    PERFORM emit_notification(NEW.tenant_id, 'cheque_added', 'شيك جديد ' || NEW.cheque_no, 'المبلغ ' || NEW.amount || '، الاستحقاق ' || NEW.due_date);
  ELSIF TG_TABLE_NAME = 'products' THEN
    IF NEW.reorder_level > 0 AND NEW.qty_on_hand <= NEW.reorder_level AND OLD.qty_on_hand > OLD.reorder_level THEN
      PERFORM emit_notification(NEW.tenant_id, 'low_stock', 'نقص مخزون: ' || NEW.name, 'الكمية الحالية ' || NEW.qty_on_hand);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_events() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_documents AFTER INSERT OR UPDATE OF status ON public.documents FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER trg_notify_entries AFTER UPDATE OF audited ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER trg_notify_payroll AFTER INSERT ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER trg_notify_cheques AFTER INSERT ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER trg_notify_products AFTER UPDATE OF qty_on_hand ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_events();
