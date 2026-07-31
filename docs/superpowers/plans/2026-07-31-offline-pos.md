# Offline POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the cashier keep selling (cash/gcash), printing receipts, and opening/closing shifts during internet outages, with auto-sync when back online.

**Architecture:** PWA Service Worker (runtime network-first cache for app shell) + localStorage queue/snapshot + auto-sync via existing HTTP API routes. Single POS terminal; outages of a few hours; temp offline receipt numbers (OF-xxx) acceptable; no offline utang/collections.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (service role), Service Worker, localStorage, Vitest (jsdom) + Playwright.

## Global Constraints

- Store ID: `96fc2959-1f16-4515-a65a-066ce21c8dc6`; single terminal.
- All money math rounded to 2dp (`roundCurrency` bankers or `Math.round((v + 1e-12) * 100) / 100`).
- Use `uuid` v4 for `clientRef` (codebase convention, not `crypto.randomUUID()`).
- Offline sales: full payment only — NO balance/utang. Send `customerId: null`.
- Sync order is strictly OPEN → SALES → CLOSE. Never sync CLOSE while the sales queue is non-empty.
- Never serve cached data to RSC requests (`RSC: 1` header or `text/x-component` accept).
- Service worker caches only `text/html`, `text/css`, `javascript`; skips `/api/` and RSC.
- Only `src/app/pos/page.tsx` calls POST `/api/sales` and `/api/shifts` — changes are scoped there.

---

### Task 1: DB Migration — `client_ref` idempotency

**Files:**
- Create: `supabase/migrations/0015_offline_sync.sql`

**Interfaces:**
- Produces: `sales.client_ref TEXT` column + partial unique index; `process_sale(p_client_ref TEXT DEFAULT NULL)` returning `{ success, sale, duplicate }`.

- [ ] **Step 1: Write migration**

```sql
-- RicePOS — Offline sync support: idempotent sales via client_ref
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref ON sales(store_id, client_ref) WHERE client_ref IS NOT NULL;

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
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());

  -- Phase 0: idempotency — return existing sale if this client_ref was already processed
  IF p_client_ref IS NOT NULL THEN
    SELECT sale_id INTO v_sale_id FROM (
      SELECT id AS sale_id, client_ref FROM sales WHERE store_id = p_store_id AND client_ref = p_client_ref
    ) s LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'sale', jsonb_build_object(
          'id', v_sale_id,
          'sale_number', (SELECT sale_number FROM sales WHERE id = v_sale_id),
          'deliveryFee', (SELECT delivery_fee FROM sales WHERE id = v_sale_id),
          'total', (SELECT total FROM sales WHERE id = v_sale_id),
          'amountPaid', (SELECT amount_paid FROM sales WHERE id = v_sale_id),
          'balance', (SELECT balance FROM sales WHERE id = v_sale_id),
          'change', (SELECT change FROM sales WHERE id = v_sale_id),
          'status', (SELECT status FROM sales WHERE id = v_sale_id)
        )
      );
    END IF;
    v_sale_id := gen_random_uuid();
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
```

- [ ] **Step 2: Apply migration to Supabase**

Run in Supabase SQL Editor (or `supabase db push`). Verify `sales.client_ref` column exists and `process_sale` accepts 18 params.

### Task 2: Sales API — clientRef idempotency

**Files:**
- Modify: `src/app/api/sales/route.ts`

**Interfaces:**
- Consumes: `process_sale(..., p_client_ref)`
- Produces: POST `/api/sales` accepts optional `clientRef`; returns `{ sale, duplicate? }` with 201 (or 200 for duplicate); skips `pos_carts` cleanup when duplicate.

- [ ] **Step 1: Add `clientRef` handling**

In `POST`, add `clientRef` to the destructured body and pass `p_client_ref: clientRef || null`. After the RPC call, detect `result.duplicate`:

```ts
const result = data as any
if (!result.success) {
  return NextResponse.json({ error: result.error || "Sale failed" }, { status: 400 })
}
if (result.duplicate) {
  return NextResponse.json({ sale: result.sale, duplicate: true }, { status: 200 })
}
```

- [ ] **Step 2: Race-condition fallback**

If RPC returns a unique-violation error (concurrent duplicate), query the existing sale by `client_ref` and return it:

```ts
if (error && clientRef) {
  const { data: existing } = await db.from("sales")
    .select("id, sale_number, delivery_fee, total, amount_paid, balance, change, status")
    .eq("store_id", storeId).eq("client_ref", clientRef).maybeSingle()
  if (existing) {
    return NextResponse.json({
      sale: {
        id: existing.id, sale_number: existing.sale_number,
        deliveryFee: existing.delivery_fee || 0, total: existing.total,
        amount_paid: existing.amount_paid, balance: existing.balance,
        change: existing.change, status: existing.status,
      },
      duplicate: true,
    }, { status: 200 })
  }
}
```

### Task 3: Offline store module

**Files:**
- Create: `src/lib/offline/store.ts`

**Interfaces:**
- Produces: typed localStorage wrapper: `getCatalog/setCatalog`, `getSession/setSession`, `getQueue/setQueue`, `getClientShift/setClientShift`, `getLastOfflineNum/setLastOfflineNum`, `getCart/setCart`, keys namespaced `ricepos:offline:v1:*`.

- [ ] **Step 1: Write the module**

```ts
const NS = "ricepos:offline:v1"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(value))
  } catch {
    // quota exceeded — clear catalog to make room; queue must survive
    if (key !== "queue") {
      try { localStorage.removeItem(`${NS}:catalog`) } catch {}
    }
  }
}

export interface QueuedSale {
  clientRef: string
  body: Record<string, any>  // full POST /api/sales body + clientRef
  createdAt: string
}

export interface ClientShift {
  openedAt: string
  openingCash: number
  openingGcash: number
  cashSales: number
  gcashSales: number
  cashCollections: number
  gcashCollections: number
  openSynced: boolean
  closingCash?: number
  closingGcash?: number
  closingDenoms?: Record<string, number>
  note?: string
}

export const offlineStore = {
  getCatalog: () => read<any[]>("catalog", []),
  setCatalog: (v: any[]) => write("catalog", v),
  getSession: () => read<{ employee: any; storeId: string } | null>("session", null),
  setSession: (v: any) => write("session", v),
  getQueue: () => read<QueuedSale[]>("queue", []),
  setQueue: (v: QueuedSale[]) => write("queue", v),
  getClientShift: () => read<ClientShift | null>("shift", null),
  setClientShift: (v: ClientShift | null) => write("shift", v),
  getLastOfflineNum: () => read<number>("num", 0),
  setLastOfflineNum: (v: number) => write("num", v),
  getCart: () => read<{ carts: any[]; activeId: string | null; savedAt: number } | null>("cart", null),
  setCart: (v: any) => write("cart", v),
}
```

### Task 4: Sync module

**Files:**
- Create: `src/lib/offline/sync.ts`

**Interfaces:**
- Consumes: `offlineStore`, POST `/api/sales`, POST/PUT `/api/shifts`
- Produces: `syncNow(): Promise<{ synced: number; failed: number }>` — order OPEN → SALES → CLOSE; `onSyncChange` subscription; `hasPending()`.

- [ ] **Step 1: Write the module**

```ts
import { offlineStore, type QueuedSale } from "./store"

export function hasPending() {
  return offlineStore.getQueue().length > 0
}

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0
  const shift = offlineStore.getClientShift()

  // 1. OPEN (only if opened offline and not yet synced)
  if (shift && !shift.openSynced) {
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opening_cash: shift.openingCash,
        opening_denoms: {},
        opening_gcash: shift.openingGcash,
      }),
    })
    if (res.ok) {
      offlineStore.setClientShift({ ...shift, openSynced: true })
      synced++
    } else {
      return { synced, failed: failed + 1 }
    }
  }

  // 2. SALES — drain fully; halt on first failure
  const queue = offlineStore.getQueue()
  for (const item of queue) {
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item.body, clientRef: item.clientRef }),
    })
    if (res.ok) {
      const remaining = offlineStore.getQueue().filter(q => q.clientRef !== item.clientRef)
      offlineStore.setQueue(remaining)
      synced++
    } else {
      failed++
      break  // halt — close must never run while sales are pending
    }
  }

  // 3. CLOSE (only after queue is empty)
  const s = offlineStore.getClientShift()
  if (s && s.closingCash !== undefined && offlineStore.getQueue().length === 0) {
    const res = await fetch("/api/shifts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closing_cash: s.closingCash,
        closing_denoms: s.closingDenoms || {},
        note: s.note || null,
        closing_gcash: s.closingGcash || 0,
      }),
    })
    if (res.ok) {
      offlineStore.setClientShift(null)
      synced++
    } else {
      failed++
    }
  }

  return { synced, failed }
}
```

### Task 5: Service worker — version bump + RSC/content-type filtering

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Rewrite sw.js**

```js
const CACHE = "ricepos-v2"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(Promise.all([clients.claim(), caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))])))
self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.pathname.startsWith("/api/")) return
  // Never cache or serve RSC streaming responses
  if (req.headers.get("RSC") === "1" || (req.headers.get("accept") || "").includes("text/x-component")) return
  e.respondWith(
    fetch(req).then(r => {
      const ct = (r.headers.get("content-type") || "").split(";")[0]
      const cacheable = ["text/html", "text/css", "application/javascript", "text/javascript"].includes(ct)
      if (r.ok && r.type === "basic" && cacheable) {
        const c = r.clone()
        caches.open(CACHE).then(cache => cache.put(req, c))
      }
      return r
    }).catch(() => caches.match(req))
  )
})
```

### Task 6: POS offline boot + held-cart persistence

**Files:**
- Modify: `src/app/pos/page.tsx`
- Modify: `src/hooks/use-cart.ts`

- [ ] **Step 1: use-cart — persist cart mirror to localStorage**

In `scheduleSync`'s timeout, write `offlineStore.setCart({ carts: list, activeId: actId, savedAt: Date.now() })` alongside the fetch. In the mount effect:
- on `.catch()`: restore from `offlineStore.getCart()` (if present, `loadedRef.current = true`, `setCarts(c.carts)`, `setActiveId(c.activeId)`)
- on success: if `c.savedAt > new Date(d.cart.updated_at).getTime()` use the local copy AND immediately re-POST it

- [ ] **Step 2: pos/page.tsx — offline session + catalog boot**

Replace the auth effect (line ~82) so a fetch failure falls back to `offlineStore.getSession()`; only redirect to `/auth/login` if there's no cached session. Cache the session on success.

Replace the catalog effect (line ~88) to add `.catch(() => { setData(prev => ({ ...prev, catalog: offlineStore.getCatalog(), categories: cachedCategories })); setLoading(false) })` and write catalog + categories to the store on success.

- [ ] **Step 3: Load shift — seed clientShift (only when queue empty)**

On `loadShift()` success: if `offlineStore.getQueue().length === 0`, seed/overwrite `clientShift` from the server shift (or clear it if `shift: null`). On `loadShift()` failure (offline): if a `clientShift` exists, `setShift(clientShiftAsShift)` so the UI stays functional.

### Task 7: Offline checkout + barcode

**Files:**
- Modify: `src/app/pos/page.tsx`

- [ ] **Step 1: processPayment — unified clientRef + offline queue path**

Generate `clientRef = uuid()` at submit. Add an offline branch:

```ts
// before the try/fetch:
const isOffline = !navigator.onLine
if (isOffline || (await ping()) === false) { /* queue offline */ }
```

Queue logic (replaces the fetch when offline):
- Require `paidTotal >= total` (else toast "Pay in full — utang is not available offline" and abort).
- Build the same POST body + `clientRef`, push to `offlineStore.getQueue()`, `setQueue`.
- Update `clientShift` using the SERVER allocation (gcash-first): `cashAlloc`, `gcashAlloc`; also apply to online sales after success.
- Show OF-xxx receipt (`OF-${(getLastOfflineNum() + 1).toString().padStart(3, "0")}` then increment + persist).
- Clear cart, resume held, skip the catalog refresh (or wrap in catch).

For ONLINE network failures: if `fetch` throws or `res.status >= 500`, enqueue the sale with the same `clientRef` (dedupe protects retry), clear cart, OF-xxx receipt. On 4xx/`success:false`: show error, keep cart, do not queue.

- [ ] **Step 2: barcode offline fallback**

In `scanBarcode`, on fetch failure, search `offlineStore.getCatalog()` for `catalog.find(i => i.barcode === code)` and open the unit picker from that item.

### Task 8: Offline shift open/close + sync triggers

**Files:**
- Modify: `src/app/pos/page.tsx`

- [ ] **Step 1: Offline shift open**

In `openShift`, on fetch failure (offline): create `clientShift` from the entered denoms/totals, `openSynced: false`, `setShift(shift)`, toast "Shift opened offline — will sync". On success: seed `clientShift` from server shift + `openSynced: true`.

- [ ] **Step 2: Offline shift close + blocking online close while pending**

In `openCloseShiftModal`: first call `syncNow()`; if `offlineStore.getQueue().length > 0`, toast "N offline sale(s) pending sync" and abort (block modal). Otherwise proceed.

In `closeShift`, on fetch failure (offline): record `closingCash/denoms/note/closingGcash` into `clientShift`, show the shift report using clientShift-derived figures, toast "Shift closed offline — will sync".

- [ ] **Step 3: Sync triggers**

Add a `useEffect` that calls `syncNow()` on `navigator.onLine` changes (window `online`/`offline` events) and on mount when online. On `syncNow` results with `failed > 0`, surface a badge "N offline sale(s) failed — contact admin".

### Task 9: Tests + verification

**Files:**
- Create: `src/lib/offline/__tests__/store.test.ts`
- Create: `src/lib/offline/__tests__/sync.test.ts`

- [ ] **Step 1: store tests** — catalog/queue/shift round-trips, quota-safe writes, queue never dropped.
- [ ] **Step 2: sync tests** — OPEN before SALES before CLOSE; halt on sale failure; close never runs with pending queue; dedupe-friendly retry.
- [ ] **Step 3: clientShift allocation tests** — gcash-first allocation matches server (cash 80/gcash 50 on total 100 → cash 50/gcash 50).
- [ ] **Step 4: Run** `npm test` and `npm run lint`.
- [ ] **Step 5: Manual smoke** — airplane mode via DevTools: boot, sell, print, open/close shift, reconnect → auto-sync.
- [ ] **Step 6: Deploy to Vercel** + apply migration to Supabase.
