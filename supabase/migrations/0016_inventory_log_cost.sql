-- RicePOS — Per-movement cost snapshot on inventory_log
-- Each movement row records the cost at that time, so the Movement screen shows
-- the actual PO price for a receive even after the product cost changes later.
-- The "Sync cost" checkbox on PO receive still controls whether items.cost is
-- updated; this only snapshots the value for display.

ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2);

-- Backfill existing rows with the item's current cost (best effort)
UPDATE inventory_log il
SET cost = i.cost
FROM items i
WHERE il.item_id = i.id AND il.cost IS NULL;

-- Recreate receive_purchase_order (the p_lines overload used by the API) to
-- stamp the PO's unit cost on the movement row.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid, p_store_id uuid, p_employee_id uuid, p_lines jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_po purchase_orders;
  v_line JSONB;
  v_line_id UUID;
  v_recv NUMERIC(12,3);
  v_update_cost BOOLEAN;
  v_poi purchase_order_items;
  v_item items;
  v_old_qty NUMERIC(12,3);
  v_new_qty NUMERIC(12,3);
  v_remaining NUMERIC(12,3);
  v_all_done BOOLEAN;
  v_any_done BOOLEAN;
  v_any_received BOOLEAN := false;
BEGIN
  -- Lock + fetch PO
  SELECT * INTO v_po FROM purchase_orders
    WHERE id = p_po_id AND store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_po.status NOT IN ('ordered','partial') THEN
    RAISE EXCEPTION 'PO cannot be received (status=%)', v_po.status;
  END IF;

  -- VALIDATE ALL lines first (no mutation yet)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id := (v_line->>'line_id')::UUID;
    v_recv := COALESCE((v_line->>'receive_qty')::NUMERIC, 0);
    IF v_recv <= 0 THEN CONTINUE; END IF;
    SELECT * INTO v_poi FROM purchase_order_items WHERE id = v_line_id AND po_id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO line not found: %', v_line_id; END IF;
    v_remaining := v_poi.qty_ordered - v_poi.qty_received;
    IF v_recv > v_remaining THEN
      RAISE EXCEPTION 'Receive qty % exceeds remaining % for line %', v_recv, v_remaining, v_line_id;
    END IF;
    v_any_received := true;
  END LOOP;

  IF NOT v_any_received THEN RAISE EXCEPTION 'Nothing to receive'; END IF;

  -- APPLY
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id := (v_line->>'line_id')::UUID;
    v_recv := COALESCE((v_line->>'receive_qty')::NUMERIC, 0);
    v_update_cost := COALESCE((v_line->>'update_cost')::BOOLEAN, false);
    IF v_recv <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_poi FROM purchase_order_items WHERE id = v_line_id;
    SELECT * INTO v_item FROM items WHERE id = v_poi.item_id FOR UPDATE;

    IF FOUND THEN
      v_old_qty := v_item.stock_qty;
      v_new_qty := v_old_qty + v_recv;
      UPDATE items SET stock_qty = v_new_qty, updated_at = now() WHERE id = v_item.id;

      INSERT INTO inventory_log(store_id, item_id, change_qty, qty_before, qty_after, reason, note, employee_id, cost)
        VALUES (p_store_id, v_item.id, v_recv, v_old_qty, v_new_qty, 'delivery', v_po.po_number, p_employee_id, v_poi.unit_cost);

      IF v_update_cost THEN
        INSERT INTO audit_log(store_id, employee_id, action, entity_type, entity_id, old_value, new_value, reason)
          VALUES (p_store_id, p_employee_id, 'cost_changed', 'item', v_item.id,
                  jsonb_build_object('cost', v_item.cost),
                  jsonb_build_object('cost', v_poi.unit_cost),
                  'PO receive ' || v_po.po_number);
        UPDATE items SET cost = v_poi.unit_cost WHERE id = v_item.id;
      END IF;
    END IF;

    UPDATE purchase_order_items SET qty_received = qty_received + v_recv WHERE id = v_line_id;
  END LOOP;

  -- RECOMPUTE STATUS
  SELECT bool_and(qty_received >= qty_ordered), bool_or(qty_received > 0)
    INTO v_all_done, v_any_done
    FROM purchase_order_items WHERE po_id = p_po_id;

  UPDATE purchase_orders
    SET status = CASE WHEN v_all_done THEN 'received' WHEN v_any_done THEN 'partial' ELSE status END,
        updated_at = now()
    WHERE id = p_po_id
    RETURNING * INTO v_po;

  INSERT INTO journal(store_id, event_type, employee_id, details)
    VALUES (p_store_id, 'po_received', p_employee_id,
            jsonb_build_object('po_number', v_po.po_number, 'lines', p_lines));

  RETURN v_po;
END;
$function$;
