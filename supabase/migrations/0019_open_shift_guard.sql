-- RicePOS — Hardening fixes
--   #1: process_sale requires an open shift (a sale outside any shift window
--       is unattributable and silently breaks drawer reconciliation).
--   #3: process_void_or_refund rejects sales belonging to an already-CLOSED
--       shift, because that shift's cash figures (cash_sales/expected_cash)
--       are persisted at close time and never recomputed. Voiding one would
--       leave the closed shift's recorded money permanently inconsistent.

CREATE OR REPLACE FUNCTION process_sale(
  p_store_id UUID,
  p_employee_id UUID,
  p_items JSONB,
  p_payments JSONB,
  p_customer_id UUID,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_discount_amount NUMERIC,
  p_discount_name TEXT,
  p_subtotal NUMERIC,
  p_tax_total NUMERIC,
  p_delivery_fee NUMERIC,
  p_total NUMERIC,
  p_total_paid NUMERIC,
  p_balance NUMERIC,
  p_change NUMERIC,
  p_sale_status TEXT,
  p_client_ref TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_json JSONB;
  v_item_id UUID; v_item_name TEXT;
  v_unit_id UUID; v_unit_name TEXT;
  v_base_qty NUMERIC; v_qty NUMERIC; v_unit_price NUMERIC;
  v_disc_eligible BOOLEAN;
  v_deducted_qty NUMERIC; v_old_qty NUMERIC; v_new_qty NUMERIC;
  v_cost_val NUMERIC; v_tax_rate NUMERIC;
  v_item_discount NUMERIC; v_item_tax NUMERIC; v_line_total NUMERIC;
  v_eligible_total NUMERIC := 0;
  v_sale_id UUID := gen_random_uuid();
  v_sale_number INTEGER; v_year INTEGER; v_seq INTEGER;
  v_pay_method TEXT; v_pay_amt NUMERIC;
  v_idx INTEGER; v_count INTEGER;
  v_existing sales%ROWTYPE;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());

  -- Phase 0a: A sale must land inside an open shift window, or it can never be
  -- attributed to a shift and its money is lost from every shift report.
  IF NOT EXISTS (
    SELECT 1 FROM shifts
    WHERE store_id = p_store_id AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No open shift. Open a shift first.');
  END IF;

  -- Phase 0: Idempotency — if this client_ref was already processed, return the existing sale.
  -- Runs before any row locking or sequence consumption so retries never waste numbers.
  IF p_client_ref IS NOT NULL THEN
    SELECT * INTO v_existing FROM sales
    WHERE store_id = p_store_id AND client_ref = p_client_ref
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'sale', jsonb_build_object(
          'id', v_existing.id,
          'sale_number', v_existing.sale_number,
          'deliveryFee', v_existing.delivery_fee,
          'total', v_existing.total,
          'amountPaid', v_existing.amount_paid,
          'balance', v_existing.balance,
          'change', v_existing.change,
          'status', v_existing.status
        )
      );
    END IF;
  END IF;

  -- Phase 1: Lock all items and verify stock
  v_count := jsonb_array_length(p_items);
  FOR v_idx IN 0..v_count - 1 LOOP
    v_json := p_items -> v_idx;
    v_item_id := (v_json ->> 'itemId')::UUID;
    v_item_name := v_json ->> 'itemName';
    v_base_qty := (v_json ->> 'baseQty')::NUMERIC;
    v_qty := (v_json ->> 'qty')::NUMERIC;
    v_unit_price := (v_json ->> 'unitPrice')::NUMERIC;
    v_disc_eligible := COALESCE((v_json ->> 'discountEligible')::BOOLEAN, false);
    v_deducted_qty := v_qty * v_base_qty;

    SELECT stock_qty, cost INTO v_old_qty, v_cost_val
    FROM items WHERE id = v_item_id AND store_id = p_store_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Product not found');
    END IF;
    IF v_old_qty < v_deducted_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock for ' || v_item_name);
    END IF;
    IF v_disc_eligible THEN
      v_eligible_total := v_eligible_total + (v_unit_price * v_qty);
    END IF;
  END LOOP;

  -- Phase 2: Generate sale number
  SELECT last_number INTO v_seq FROM sale_sequences
  WHERE store_id = p_store_id AND year = v_year FOR UPDATE;
  IF v_seq IS NULL THEN
    INSERT INTO sale_sequences (store_id, year, last_number) VALUES (p_store_id, v_year, 1);
    v_sale_number := 1;
  ELSE
    v_sale_number := v_seq + 1;
    UPDATE sale_sequences SET last_number = v_sale_number WHERE store_id = p_store_id AND year = v_year;
  END IF;

  -- Phase 3: Insert sale
  INSERT INTO sales (
    id, store_id, sale_number, employee_id, customer_id, client_ref,
    subtotal, discount_type, discount_value, discount_amount, discount_name,
    tax_total, delivery_fee, total, amount_paid, balance, change, status
  ) VALUES (
    v_sale_id, p_store_id, v_sale_number, p_employee_id, p_customer_id, p_client_ref,
    p_subtotal, p_discount_type::discount_type, p_discount_value, p_discount_amount, p_discount_name,
    p_tax_total, p_delivery_fee, p_total, p_total_paid, p_balance, p_change,
    p_sale_status::sale_status
  );

  -- Phase 4: Deduct stock, insert sale_items, log inventory
  FOR v_idx IN 0..v_count - 1 LOOP
    v_json := p_items -> v_idx;
    v_item_id := (v_json ->> 'itemId')::UUID;
    v_item_name := v_json ->> 'itemName';
    v_unit_id := (v_json ->> 'unitId')::UUID;
    v_unit_name := v_json ->> 'unitName';
    v_base_qty := (v_json ->> 'baseQty')::NUMERIC;
    v_qty := (v_json ->> 'qty')::NUMERIC;
    v_unit_price := (v_json ->> 'unitPrice')::NUMERIC;
    v_disc_eligible := COALESCE((v_json ->> 'discountEligible')::BOOLEAN, false);
    v_deducted_qty := v_qty * v_base_qty;

    SELECT stock_qty, cost INTO v_old_qty, v_cost_val FROM items WHERE id = v_item_id;
    v_new_qty := v_old_qty - v_deducted_qty;
    UPDATE items SET stock_qty = v_new_qty WHERE id = v_item_id;

    INSERT INTO inventory_log (id, store_id, item_id, change_qty, qty_before, qty_after, reason, sale_id, employee_id)
    VALUES (gen_random_uuid(), p_store_id, v_item_id, -v_deducted_qty, v_old_qty, v_new_qty, 'sale', v_sale_id, p_employee_id);

    SELECT COALESCE(tr.rate, 0) INTO v_tax_rate
    FROM items i LEFT JOIN tax_rates tr ON tr.id = i.tax_rate_id WHERE i.id = v_item_id;

    v_item_discount := 0;
    IF p_discount_amount > 0 AND v_disc_eligible AND v_eligible_total > 0 THEN
      v_item_discount := p_discount_amount * ((v_unit_price * v_qty) / v_eligible_total);
    END IF;

    v_item_tax := CASE WHEN v_disc_eligible AND p_discount_amount > 0
      THEN ((v_unit_price * v_qty) - v_item_discount) * v_tax_rate
      ELSE (v_unit_price * v_qty) * v_tax_rate END;

    v_line_total := (v_unit_price * v_qty) - v_item_discount + v_item_tax;

    INSERT INTO sale_items (
      id, sale_id, item_id, item_name, selling_unit_id, selling_unit_name,
      base_qty_snapshot, qty, unit_price, cost_at_sale, tax_rate, tax_amount,
      discount_amount, line_total, deducted_qty, status
    ) VALUES (
      gen_random_uuid(), v_sale_id, v_item_id, v_item_name,
      v_unit_id, v_unit_name, v_base_qty, v_qty, v_unit_price,
      CASE WHEN v_cost_val IS NOT NULL THEN v_cost_val ELSE NULL END,
      v_tax_rate, v_item_tax, v_item_discount, v_line_total, v_deducted_qty, 'completed'
    );
  END LOOP;

  -- Phase 5: Insert payments
  v_count := jsonb_array_length(p_payments);
  FOR v_idx IN 0..v_count - 1 LOOP
    v_json := p_payments -> v_idx;
    v_pay_method := v_json ->> 'method';
    v_pay_amt := COALESCE((v_json ->> 'recorded_amount')::NUMERIC, (v_json ->> 'amount')::NUMERIC);
    IF v_pay_amt > 0 THEN
      INSERT INTO payments (id, sale_id, method, amount, is_collection, receipt_no, created_by)
      VALUES (gen_random_uuid(), v_sale_id, v_pay_method::payment_method, v_pay_amt,
              false, 'REC-' || LPAD(v_sale_number::TEXT, 6, '0'), p_employee_id);
    END IF;
  END LOOP;

  -- Phase 6: Journal
  INSERT INTO journal (id, store_id, event_type, sale_id, employee_id, details)
  VALUES (gen_random_uuid(), p_store_id, 'sale_completed', v_sale_id, p_employee_id,
    jsonb_build_object('sale_number', v_sale_number, 'total', p_total, 'balance', p_balance, 'status', p_sale_status, 'change', p_change));

  RETURN jsonb_build_object(
    'success', true,
    'sale', jsonb_build_object(
      'id', v_sale_id, 'sale_number', v_sale_number,
      'deliveryFee', p_delivery_fee, 'total', p_total,
      'amountPaid', p_total_paid, 'balance', p_balance, 'change', p_change, 'status', p_sale_status
    )
  );
END;
$$;

-- #3: Void/refund must target a sale still inside an OPEN shift. Sales are
-- attributed to a shift by the opened_at..closed_at created_at window. If the
-- sale's shift is already CLOSED, its cash_sales/expected_cash were persisted
-- at close time and will not be recomputed — reversing now would leave the
-- closed shift's figures permanently wrong. Reject with a clear message.
CREATE OR REPLACE FUNCTION process_void_or_refund(
  p_store_id UUID,
  p_employee_id UUID,
  p_sale_id UUID,
  p_action TEXT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale RECORD;
  v_shift RECORD;
  v_item RECORD;
  v_old_qty NUMERIC;
  v_new_qty NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Lock sale row
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sale not found');
  END IF;
  IF v_sale.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot ' || p_action || ' a sale with status ''' || v_sale.status || '''');
  END IF;

  -- Reject void/refund of a sale that already belongs to a CLOSED shift.
  SELECT * INTO v_shift FROM shifts
  WHERE store_id = p_store_id
    AND opened_at <= v_sale.created_at
    AND (closed_at IS NULL OR closed_at >= v_sale.created_at)
  ORDER BY opened_at DESC
  LIMIT 1;
  IF FOUND AND v_shift.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Cannot ' || p_action || ' a sale from a closed shift. Reopen the shift first, or adjust manually.');
  END IF;

  -- Lock and restock items
  FOR v_item IN SELECT si.* FROM sale_items si WHERE si.sale_id = p_sale_id AND si.status = 'completed'
  LOOP
    -- Lock item row
    SELECT stock_qty INTO v_old_qty FROM items WHERE id = v_item.item_id FOR UPDATE;
    IF FOUND THEN
      v_new_qty := v_old_qty + COALESCE(v_item.deducted_qty, 0);

      UPDATE items SET stock_qty = v_new_qty, updated_at = now() WHERE id = v_item.item_id;

      INSERT INTO inventory_log (id, store_id, item_id, change_qty, qty_before, qty_after, reason, sale_id, employee_id)
      VALUES (gen_random_uuid(), p_store_id, v_item.item_id, COALESCE(v_item.deducted_qty, 0),
              v_old_qty, v_new_qty, p_action, p_sale_id, p_employee_id);
    END IF;

    UPDATE sale_items SET status = CASE WHEN p_action = 'void' THEN 'voided'::sale_item_status ELSE 'refunded'::sale_item_status END,
      void_reason = p_reason
    WHERE id = v_item.id;
  END LOOP;

  -- Update sale status
  v_new_status := CASE WHEN p_action = 'void' THEN 'voided' ELSE 'refunded' END;
  UPDATE sales SET status = v_new_status::sale_status, void_reason = p_reason,
    voided_at = now(), voided_by = p_employee_id, updated_at = now()
  WHERE id = p_sale_id;

  -- Reverse payments
  DELETE FROM payments WHERE sale_id = p_sale_id;

  -- Audit log
  INSERT INTO audit_log (id, store_id, employee_id, action, entity_type, entity_id, old_value, new_value, reason)
  VALUES (gen_random_uuid(), p_store_id, p_employee_id, 'sale_' || p_action || 'ed', 'sale', p_sale_id,
    jsonb_build_object('status', 'completed', 'sale_number', v_sale.sale_number),
    jsonb_build_object('status', v_new_status), p_reason);

  -- Journal
  INSERT INTO journal (id, store_id, event_type, sale_id, employee_id, details)
  VALUES (gen_random_uuid(), p_store_id, 'sale_' || p_action || 'ed', p_sale_id, p_employee_id,
    jsonb_build_object('sale_number', v_sale.sale_number, 'previous_status', 'completed',
      'new_status', v_new_status, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'sale', jsonb_build_object('id', p_sale_id, 'status', v_new_status));
END;
$$;