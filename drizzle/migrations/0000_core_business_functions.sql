
CREATE OR REPLACE FUNCTION public.set_entry_no() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.entry_no IS NULL OR NEW.entry_no = 0 THEN
    SELECT coalesce(max(entry_no),0)+1 INTO NEW.entry_no FROM journal_entries WHERE tenant_id=NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entry_no ON public.journal_entries;
CREATE TRIGGER trg_entry_no BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_entry_no();

CREATE OR REPLACE FUNCTION public.guard_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cu date;
BEGIN
  IF current_setting('app.bypass', true) = '1' THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP='DELETE' AND OLD.audited THEN RAISE EXCEPTION 'لا يمكن حذف قيد مدقق'; END IF;
  IF TG_OP='UPDATE' AND OLD.audited AND NEW.audited THEN RAISE EXCEPTION 'لا يمكن تعديل قيد مدقق'; END IF;
  SELECT closed_until INTO cu FROM tenant_settings WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id);
  IF cu IS NOT NULL AND (CASE WHEN TG_OP='DELETE' THEN OLD.entry_date ELSE NEW.entry_date END) <= cu THEN
    RAISE EXCEPTION 'الفترة مقفلة حتى %', cu;
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_entry ON public.journal_entries;
CREATE TRIGGER trg_guard_entry BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_entry();

CREATE OR REPLACE FUNCTION public.apply_stock_move() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; wq numeric;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE products SET qty_on_hand = qty_on_hand - CASE WHEN OLD.direction='in' THEN OLD.qty ELSE -OLD.qty END WHERE id=OLD.product_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT * INTO p FROM products WHERE id=NEW.product_id FOR UPDATE;
    IF NEW.direction='out' THEN
      SELECT coalesce(sum(CASE WHEN direction='in' THEN qty ELSE -qty END),0) INTO wq FROM stock_moves
        WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id AND id<>NEW.id;
      IF wq < NEW.qty THEN RAISE EXCEPTION 'الكمية غير متوفرة في المستودع (المتوفر %)', wq; END IF;
      IF coalesce(NEW.unit_cost,0)=0 THEN NEW.unit_cost := p.avg_cost; END IF;
      UPDATE products SET qty_on_hand = qty_on_hand - NEW.qty WHERE id=NEW.product_id;
    ELSE
      UPDATE products SET
        avg_cost = CASE WHEN greatest(p.qty_on_hand,0) + NEW.qty > 0 THEN (greatest(p.qty_on_hand,0)*p.avg_cost + NEW.qty*NEW.unit_cost)/(greatest(p.qty_on_hand,0)+NEW.qty) ELSE NEW.unit_cost END,
        last_purchase_price = CASE WHEN NEW.unit_cost>0 THEN NEW.unit_cost ELSE last_purchase_price END,
        qty_on_hand = qty_on_hand + NEW.qty WHERE id=NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_stock_move ON public.stock_moves;
CREATE TRIGGER trg_stock_move BEFORE INSERT OR UPDATE OR DELETE ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.apply_stock_move();

CREATE OR REPLACE FUNCTION public.set_entry_audited(_id uuid, _ok boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_auditor() THEN RAISE EXCEPTION 'التدقيق مسموح للمدقق فقط'; END IF;
  PERFORM set_config('app.bypass','1',true);
  UPDATE journal_entries SET audited=_ok, audited_at=CASE WHEN _ok THEN now() END, audited_by=CASE WHEN _ok THEN auth.uid() END
   WHERE id=_id AND tenant_id=my_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'القيد غير موجود'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_currency(_code text, _name text, _symbol text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF my_tenant_id() IS NULL OR NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO currencies(tenant_id,code,name,symbol) VALUES (my_tenant_id(), upper(trim(_code)), _name, nullif(_symbol,''));
END $$;

CREATE OR REPLACE FUNCTION public.mark_notifications_seen() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE profiles SET notif_seen_at=now() WHERE id=auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE tenants SET name=coalesce(nullif(trim(_name),''),name), code=nullif(_code,''), phone=nullif(_phone,''), address=nullif(_address,''), notes=nullif(_notes,'')
   WHERE id=my_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION public.unpost_document(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM documents WHERE id=_id AND tenant_id=my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','edit')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF d.status<>'posted' THEN RETURN; END IF;
  DELETE FROM stock_moves WHERE document_id=_id;
  UPDATE documents SET status='draft', journal_entry_id=NULL WHERE id=_id;
  IF d.journal_entry_id IS NOT NULL THEN
    DELETE FROM journal_lines WHERE entry_id=d.journal_entry_id;
    DELETE FROM journal_entries WHERE id=d.journal_entry_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.post_document(_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; s record; l record; e uuid; amt numeric:=0; cost numeric:=0; pacc uuid; cash uuid; c numeric;
BEGIN
  SELECT * INTO d FROM documents WHERE id=_id AND tenant_id=my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF d.status='posted' THEN RETURN d.journal_entry_id; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id=d.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات أولاً'; END IF;
  SELECT account_id INTO pacc FROM partners WHERE id=d.partner_id;
  cash := coalesce(d.account_id, s.cash_account_id);

  IF d.doc_type IN ('sale','purchase','transfer','stock_in','stock_out') THEN
    FOR l IN SELECT * FROM document_lines WHERE document_id=_id LOOP
      amt := amt + l.qty*l.unit_price;
      IF d.doc_type IN ('sale','stock_out','transfer') THEN
        SELECT avg_cost INTO c FROM products WHERE id=l.product_id;
        cost := cost + l.qty*coalesce(c,0);
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,d.warehouse_id,d.doc_date,'out',l.qty,coalesce(c,0),d.project_id,d.partner_id,_id,d.doc_type);
        IF d.doc_type='transfer' THEN
          INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,document_id,reference)
            VALUES (d.tenant_id,l.product_id,d.to_warehouse_id,d.doc_date,'in',l.qty,coalesce(c,0),_id,'transfer');
        END IF;
      ELSE
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,d.warehouse_id,d.doc_date,'in',l.qty,l.unit_price,d.project_id,d.partner_id,_id,d.doc_type);
      END IF;
    END LOOP;
  ELSE
    amt := d.amount;
  END IF;

  IF d.doc_type <> 'transfer' THEN
    INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by)
      VALUES (d.tenant_id,0,d.doc_date,coalesce(d.notes,d.doc_type),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid()) RETURNING id INTO e;
    IF d.doc_type='sale' THEN
      pacc := coalesce(pacc,s.customers_account_id);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES
        (d.tenant_id,e,pacc,d.partner_id,amt,0),(d.tenant_id,e,s.sales_account_id,NULL,0,amt);
      IF cost>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (d.tenant_id,e,s.cogs_account_id,cost,0),(d.tenant_id,e,s.inventory_account_id,0,cost); END IF;
    ELSIF d.doc_type='purchase' THEN
      pacc := coalesce(pacc,s.suppliers_account_id);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES
        (d.tenant_id,e,s.inventory_account_id,NULL,amt,0),(d.tenant_id,e,pacc,d.partner_id,0,amt);
    ELSIF d.doc_type='receipt' THEN
      pacc := coalesce(pacc,s.customers_account_id);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,project_id,debit,credit) VALUES
        (d.tenant_id,e,cash,NULL,NULL,amt,0),(d.tenant_id,e,pacc,d.partner_id,d.project_id,0,amt);
    ELSIF d.doc_type='payment' THEN
      pacc := coalesce(pacc,s.suppliers_account_id);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,project_id,debit,credit) VALUES
        (d.tenant_id,e,pacc,d.partner_id,d.project_id,amt,0),(d.tenant_id,e,cash,NULL,NULL,0,amt);
    ELSIF d.doc_type='stock_in' THEN
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (d.tenant_id,e,s.inventory_account_id,amt,0),(d.tenant_id,e,coalesce(d.account_id,s.inventory_adjust_account_id),0,amt);
    ELSIF d.doc_type='stock_out' AND cost>0 THEN
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,project_id,debit,credit) VALUES
        (d.tenant_id,e,CASE WHEN d.project_id IS NOT NULL THEN s.project_cost_account_id ELSE s.inventory_adjust_account_id END,d.project_id,cost,0),
        (d.tenant_id,e,s.inventory_account_id,NULL,0,cost);
    END IF;
  END IF;
  UPDATE documents SET status='posted', journal_entry_id=e, amount=CASE WHEN d.doc_type IN ('receipt','payment') THEN amount ELSE amt END WHERE id=_id;
  RETURN e;
EXCEPTION WHEN not_null_violation THEN
  RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات (يوجد حساب غير محدد)';
END $$;

CREATE OR REPLACE FUNCTION public.close_fiscal_year() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := my_tenant_id(); s record; e uuid; net numeric; ob uuid;
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id=t;
  IF s.fiscal_start IS NULL OR s.fiscal_end IS NULL THEN RAISE EXCEPTION 'حدد السنة المالية أولاً'; END IF;
  IF s.retained_earnings_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الأرباح المحتجزة'; END IF;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by)
    VALUES (t,0,s.fiscal_end,'قيد إقفال السنة المالية','USD',1,'closing',auth.uid()) RETURNING id INTO e;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit)
    SELECT t,e,a.id, greatest(sum(l.credit-l.debit),0), greatest(sum(l.debit-l.credit),0)
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE l.tenant_id=t AND a.nature='profit_loss' AND j.entry_date BETWEEN s.fiscal_start AND s.fiscal_end AND j.id<>e
    GROUP BY a.id HAVING sum(l.debit-l.credit)<>0;
  SELECT coalesce(sum(debit-credit),0) INTO net FROM journal_lines WHERE entry_id=e;
  IF net<>0 THEN
    INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit)
      VALUES (t,e,s.retained_earnings_account_id,'صافي نتيجة السنة',greatest(-net,0),greatest(net,0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id=e) THEN DELETE FROM journal_entries WHERE id=e; END IF;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by)
    VALUES (t,0,s.fiscal_end+1,'قيد افتتاحي - تدوير الأرصدة','USD',1,'opening',auth.uid()) RETURNING id INTO ob;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit)
    SELECT t,ob,a.id,l.partner_id, greatest(sum(l.debit-l.credit),0), greatest(sum(l.credit-l.debit),0)
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE l.tenant_id=t AND a.nature='balance_sheet' AND j.entry_date<=s.fiscal_end
    GROUP BY a.id,l.partner_id HAVING sum(l.debit-l.credit)<>0;
  IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id=ob) THEN DELETE FROM journal_entries WHERE id=ob; END IF;
  UPDATE tenant_settings SET closed_until=s.fiscal_end,
    fiscal_start=s.fiscal_end+1, fiscal_end=(s.fiscal_end + interval '1 year')::date, updated_at=now() WHERE tenant_id=t;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_fiscal_period() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE tenant_settings SET closed_until=NULL, updated_at=now() WHERE tenant_id=my_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION public.clear_tenant_data(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM set_config('app.bypass','1',true);
  UPDATE tenant_settings SET cash_account_id=NULL,customers_account_id=NULL,suppliers_account_id=NULL,inventory_account_id=NULL,
    sales_account_id=NULL,cogs_account_id=NULL,project_cost_account_id=NULL,fx_account_id=NULL,retained_earnings_account_id=NULL,
    salaries_account_id=NULL,advances_account_id=NULL,inventory_adjust_account_id=NULL,closed_until=NULL WHERE tenant_id=_id;
  UPDATE documents SET journal_entry_id=NULL, settles_document_id=NULL WHERE tenant_id=_id;
  UPDATE journal_entries SET document_id=NULL WHERE tenant_id=_id;
  ALTER TABLE stock_moves DISABLE TRIGGER trg_stock_move;
  DELETE FROM stock_moves WHERE tenant_id=_id;
  ALTER TABLE stock_moves ENABLE TRIGGER trg_stock_move;
  DELETE FROM document_lines WHERE tenant_id=_id;
  DELETE FROM journal_lines WHERE tenant_id=_id;
  DELETE FROM journal_entries WHERE tenant_id=_id;
  DELETE FROM documents WHERE tenant_id=_id;
  DELETE FROM cheques WHERE tenant_id=_id;
  DELETE FROM project_expenses WHERE tenant_id=_id;
  DELETE FROM project_milestones WHERE tenant_id=_id;
  DELETE FROM boq_items WHERE tenant_id=_id;
  DELETE FROM projects WHERE tenant_id=_id;
  DELETE FROM products WHERE tenant_id=_id;
  DELETE FROM warehouses WHERE tenant_id=_id;
  DELETE FROM banks WHERE tenant_id=_id;
  DELETE FROM fixed_assets WHERE tenant_id=_id;
  DELETE FROM partners WHERE tenant_id=_id;
  DELETE FROM exchange_rates WHERE tenant_id=_id;
  DELETE FROM currencies WHERE tenant_id=_id;
  UPDATE accounts SET parent_id=NULL WHERE tenant_id=_id;
  DELETE FROM accounts WHERE tenant_id=_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.clear_tenant_data(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_tenant(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM clear_tenant_data(_id);
  DELETE FROM tenant_settings WHERE tenant_id=_id;
  DELETE FROM user_permissions WHERE tenant_id=_id;
  DELETE FROM tenant_features WHERE tenant_id=_id;
  DELETE FROM notifications WHERE tenant_id=_id;
  DELETE FROM subscription_history WHERE tenant_id=_id;
  DELETE FROM tenant_payments WHERE tenant_id=_id;
  UPDATE profiles SET tenant_id=NULL WHERE tenant_id=_id;
  DELETE FROM tenants WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_tenant(_id uuid, _data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tbl text; ts jsonb;
BEGIN
  IF NOT (is_super_admin() OR (is_tenant_admin() AND my_tenant_id()=_id)) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM clear_tenant_data(_id);
  INSERT INTO accounts SELECT * FROM jsonb_populate_recordset(NULL::accounts,
    (SELECT coalesce(jsonb_agg((x - 'parent_id') || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(coalesce(_data->'accounts','[]'::jsonb)) x));
  UPDATE accounts a SET parent_id=(x->>'parent_id')::uuid FROM jsonb_array_elements(coalesce(_data->'accounts','[]'::jsonb)) x
    WHERE a.id=(x->>'id')::uuid AND nullif(x->>'parent_id','') IS NOT NULL;
  FOREACH tbl IN ARRAY ARRAY['currencies','exchange_rates','partners','warehouses','banks','fixed_assets','projects','boq_items',
    'project_expenses','project_milestones','cheques','products','documents','journal_entries','journal_lines','document_lines'] LOOP
    IF _data ? tbl THEN
      EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1)', tbl)
        USING (SELECT coalesce(jsonb_agg(
                 (CASE WHEN tbl='documents' THEN x - 'journal_entry_id' - 'settles_document_id' ELSE x END)
                 || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(_data->tbl) x);
    END IF;
  END LOOP;
  IF _data ? 'stock_moves' THEN
    ALTER TABLE stock_moves DISABLE TRIGGER trg_stock_move;
    INSERT INTO stock_moves SELECT * FROM jsonb_populate_recordset(NULL::stock_moves,
      (SELECT coalesce(jsonb_agg(x || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(_data->'stock_moves') x));
    ALTER TABLE stock_moves ENABLE TRIGGER trg_stock_move;
  END IF;
  UPDATE documents dd SET journal_entry_id=nullif(x->>'journal_entry_id','')::uuid, settles_document_id=nullif(x->>'settles_document_id','')::uuid
    FROM jsonb_array_elements(coalesce(_data->'documents','[]'::jsonb)) x WHERE dd.id=(x->>'id')::uuid;
  ts := _data->'tenant_settings'->0;
  IF ts IS NOT NULL THEN
    UPDATE tenant_settings t SET
      cash_account_id=r.cash_account_id, customers_account_id=r.customers_account_id, suppliers_account_id=r.suppliers_account_id,
      inventory_account_id=r.inventory_account_id, sales_account_id=r.sales_account_id, cogs_account_id=r.cogs_account_id,
      project_cost_account_id=r.project_cost_account_id, fx_account_id=r.fx_account_id, retained_earnings_account_id=r.retained_earnings_account_id,
      salaries_account_id=r.salaries_account_id, advances_account_id=r.advances_account_id, inventory_adjust_account_id=r.inventory_adjust_account_id,
      fiscal_start=r.fiscal_start, fiscal_end=r.fiscal_end, closed_until=r.closed_until
    FROM jsonb_populate_record(NULL::tenant_settings, ts) r WHERE t.tenant_id=_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.restore_tenant(uuid,jsonb), public.purge_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_audited(uuid,boolean), public.add_currency(text,text,text), public.mark_notifications_seen(),
  public.update_company_info(text,text,text,text,text), public.post_document(uuid), public.unpost_document(uuid),
  public.close_fiscal_year(), public.reopen_fiscal_period(), public.purge_tenant(uuid), public.restore_tenant(uuid,jsonb) TO authenticated;
