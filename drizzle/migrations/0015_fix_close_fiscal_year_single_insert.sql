CREATE OR REPLACE FUNCTION public.close_fiscal_year()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t uuid := public.current_tenant_id(); s record; eid uuid; eno int; net numeric; lbl text;
BEGIN
  IF t IS NULL OR NOT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'فقط مدير الشركة يمكنه إقفال السنة المالية';
  END IF;
  SELECT * INTO s FROM public.tenant_settings WHERE tenant_id = t;
  IF s.fiscal_start IS NULL OR s.fiscal_end IS NULL THEN RAISE EXCEPTION 'حدد بداية ونهاية السنة المالية أولاً'; END IF;
  IF s.retained_earnings_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الأرباح والخسائر (الختامي) في الإعدادات'; END IF;
  PERFORM set_config('app.closing', 'on', true);
  lbl := 'قيد إقفال السنة المالية ' || s.fiscal_start || ' - ' || s.fiscal_end;

  CREATE TEMP TABLE _cl ON COMMIT DROP AS
    SELECT l.account_id, round(SUM((l.debit - l.credit) / NULLIF(e.exchange_rate,0)), 2) AS bal
    FROM public.journal_lines l JOIN public.journal_entries e ON e.id = l.entry_id
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.tenant_id = t AND a.nature = 'profit_loss' AND e.entry_date BETWEEN s.fiscal_start AND s.fiscal_end
    GROUP BY l.account_id;
  DELETE FROM _cl WHERE bal = 0 OR bal IS NULL;
  SELECT COALESCE(SUM(bal),0) INTO net FROM _cl;

  IF EXISTS (SELECT 1 FROM _cl) THEN
    SELECT COALESCE(MAX(entry_no),0)+1 INTO eno FROM public.journal_entries WHERE tenant_id = t;
    INSERT INTO public.journal_entries (tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
    VALUES (t, eno, s.fiscal_end, lbl, 'USD', 1, 'closing', auth.uid()) RETURNING id INTO eid;
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, description, debit, credit)
    SELECT t, eid, account_id, lbl, GREATEST(-bal,0), GREATEST(bal,0) FROM _cl
    UNION ALL
    SELECT t, eid, s.retained_earnings_account_id, 'نتيجة السنة - ' || lbl, GREATEST(net,0), GREATEST(-net,0) WHERE net <> 0;
  END IF;
  DROP TABLE _cl;

  UPDATE public.tenant_settings SET closed_until = s.fiscal_end,
    fiscal_start = s.fiscal_end + 1,
    fiscal_end = (s.fiscal_end + interval '1 year')::date
  WHERE tenant_id = t;
  RETURN eid;
END $$;