-- RicePOS — Correct historical movement costs
-- The 0016 backfill stamped rows with items.cost at migration time, which
-- does not reflect the actual cost at the time of each movement. Restore the
-- true historical cost from the source of truth:
--   delivery rows  -> purchase_order_items.unit_cost (via inventory_log.note = po_number)
--   sale rows      -> sale_items.cost_at_sale (via sale_id + item_id)

UPDATE inventory_log il
SET cost = poi.unit_cost
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.po_id
WHERE il.reason = 'delivery'
  AND il.note = po.po_number
  AND il.item_id = poi.item_id
  AND il.cost IS DISTINCT FROM poi.unit_cost;

UPDATE inventory_log il
SET cost = si.cost_at_sale
FROM sale_items si
WHERE il.reason = 'sale'
  AND il.sale_id = si.sale_id
  AND il.item_id = si.item_id
  AND si.cost_at_sale IS NOT NULL
  AND il.cost IS DISTINCT FROM si.cost_at_sale;
