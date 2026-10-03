CREATE OR REPLACE FUNCTION public.post_document(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; s record; l record; e uuid; amt numeric:=0; cost numeric:=0; pacc uuid; cash uuid; c numeric;
BEGIN
  PERFORM set_config('app.posting','on',true);
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
END $function$;

CREATE OR REPLACE FUNCTION public.unpost_document(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record;
BEGIN
  PERFORM set_config('app.posting','on',true);
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
END $function$;