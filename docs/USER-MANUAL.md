# Kabayan Mart — POS System User Manual

**Version:** 2.1 (August 2026)
**App:** Kabayan Mart POS (web / tablet)

This manual explains how to use the store system day-to-day, from selling at
the counter to managing stock, suppliers, consignments, utang (credit), and
reports. Screens are designed for tablet, desk monitor, or phone — and the POS
keeps working even offline.

---

## Table of Contents
1. [Getting Started](#1-getting-started)
2. [Signing In / Out](#2-signing-in--out)
3. [The POS Screen](#3-the-pos-screen)
4. [Selling an Item](#4-selling-an-item)
5. [Payment (Cash & GCash)](#5-payment-cash--gcash)
6. [Hold & Resume](#6-hold--resume)
7. [Open & Close Shift](#7-open--close-shift)
8. [Working Offline](#8-working-offline)
9. [Dashboard](#9-dashboard)
10. [Reports](#10-reports)
11. [Sales History](#11-sales-history)
12. [Customers & Utang (credit)](#12-customers--utang-credit)
13. [Items / Products](#13-items--products)
14. [Inventory, Movements & Adjustments](#14-inventory-movements--adjustments)
15. [Purchase Orders & Receive](#15-purchase-orders--receive)
16. [Consignments](#16-consignments)
17. [Suppliers](#17-suppliers)
18. [Expenses](#18-expenses)
19. [Categories, Tax Rates & Discounts](#19-categories-tax-rates--discounts)
20. [Staff / Employees](#20-staff--employees)
21. [Shifts (money & GCash report)](#21-shifts-money--gcash-report)
22. [Settings](#22-settings)
23. [Receipt Printer (Bluetooth)](#23-receipt-printer-bluetooth)
24. [Audit Log & Journal](#24-audit-log--journal)

---

## 1. Getting Started

**You need:**
- A web browser — **Chrome on Android** (phone or tablet) is recommended.
- A **store account** (built-in username + password given by the owner).

**Open the app**
Open the store URL in the browser (e.g. `https://ricepos-eight.vercel.app`).
You can "Add to Home Screen" so it behaves like an app and stays working even
when internet drops (see [Working Offline](#8-working-offline)).

---

## 2. Signing In / Out

**Login**
1. Open the login page.
2. Type your **Username** (the box hints "Admin or Cashier") and your Password.
3. Tap **Sign In / Log In**.

- **Admin** opens the **Dashboard**.
- **Cashier** opens straight to the **POS** (selling screen).

**Sign out** — use the sign-out button near your name. Do this before you leave
the counter.

> Admins see everything. Cashiers land on the POS and only get the tools for
> selling. If you can't see a menu, it's hidden for your role.

---

## 3. The POS Screen

The **POS** is where you sell. Product tiles fill the screen, each showing its
stock. There is a **search** box ("Search or scan barcode...").

**Important:** you cannot sell until a **shift is open**. If you tap an item
first, the system reminds you to open a shift.

---

## 4. Selling an Item

1. Find the product — tap a category, tap a product, or use the **search /
   barcode** box.
   - **Search** — type part of the name.
   - **Scan** — point a USB/hardware barcode scanner and scan the barcode, or
     type the barcode number and press Enter.
2. **Tap the product** → a small **unit picker** window opens (e.g. "Per Kilo",
   "Sack 50kg"), showing your sale **units** and the quantity.
3. Pick the unit, set the **quantity**, and tap **Add to Cart**.
4. Add every item the same way. The order builds on the right (cart).

**Cart buttons (right side):**
- **Pay** — go to payment.
- **Hold** — park this order and serve the next customer (see below).
- **Clear** — empty the cart and start over.

Stock is checked when you add to cart, so you can't oversell below zero.

---

## 5. Payment (Cash & GCash)

The store takes **Cash** and **GCash**. There is no card terminal at this time.

1. Tap **Pay**.
2. In the payment window, enter:
   - **Cash** — the cash amount received.
   - **GCash** — the GCash amount, if part/all paid by GCash.
3. **Mixed** is simply entering both amounts (e.g. cash ₱100 + GCash ₱50 for a
   ₱150 sale).
4. The total, received, and **change** (if cash exceeds) are shown.
5. Tap **Confirm Payment** to finish.

**Balance / utang:** if the paid amount is **less** than the total, a customer
who has the balance to pay later — you must choose a **customer** first and a
balance (utang) is recorded against them (see [Customers](#12-customers--utang-credit)).

**After payment:**
- A **receipt preview** appears with the envelope number. Use **Print** or
  **Close**.
- On a **cash** sale, the **cash drawer** opens automatically (if fitted).
- When a balance is put on a customer account, payments push the drawer for
  cash and GCash both.
- This is **not possible to undo** except by **Void/Refund** (see
  [Sales History](#11-sales-history)) — never close shop without signing out.

*Note: The receipt only prints from the "Print" button in this window.*
*Automatic printing after each sale is a Settings option, but it is currently
not wired to printing automatically.*

---

## 6. Hold & Clear

- **Hold** parks the current order and starts a fresh cart labelled
  `Customer #1`, `#2`...
- Held orders appear as chips **"Held (n)"** at the top of the cart — tap one
  to **resume** it.
- After you finish a sale, the most recent held cart resumes automatically.
- **Clear** empties the cart completely.

---

## 7. Open & Close Shift

A **shift** is one cashier's working turn and the money for which they are
responsible. Only **one shift is open at a time** for the whole store.

**Open Shift**
1. Tap **Open Shift** → window **"Open Shift — Count Starting Cash"**.
2. Enter the **GCash Balance** at the start of the turn (if GCash is collected
   from the GCash/remit) — often 0.
3. Build the **opening cash** with the coin/bill counter (denomination pad up
   to ₱1000 / down to 25¢); the **TOTAL CASH** is calculated for you.
4. Tap **Open Shift (₱total)** — the shift is now open.

**Close Shift**
1. At the end of your turn tap **Close Shift** → **"Count Cash"**.
2. See the live summary — **Opening Cash / Cash Sales / GCash Sales /
   Cash Collections / Expected in Drawer**.
3. Enter the **GCash** actually in hand (counted GCash Balance).
4. Build the **counted cash** with the denomination counter (the drawer money).
5. Watch **Variance** — it shows **+ (over)** or **− (short)** or balanced.
6. Optionally add a **Note**.
7. Tap **Close Shift & Print** — a shift receipt prints and the report is saved.

**Rules:**
- Selling with no open shift is **blocked** — the app asks you to open one.
- If you try to close a shift while **offline sales are waiting to sync**, the
  app will first try to sync, and if any are still pending it **won't close**
  until they upload — so no sale is lost.

---

## 8. Working Offline

The POS keeps working if the internet or the tablet's network drops.

- You can keep **selling** while offline — sales are saved on the device.
- When the internet returns, the POS **auto-syncs** those sales to the server.
- A **"Pending Sync (n)"** badge (shows the count) means there are unsent sales.
  Tap it to open the **"Pending Offline Items"** dialog:
  - Each pending sale is listed ("Receipt OF-…" / "Sale …").
  - **Retry Sync** — try uploading them now.
  - **Discard** — remove a pending item (only if you really want to lose it).
  - If a "loss close" is queued, it shows separately and can be closed locally.
- Sync happens in order **Open → Sales → Close** — a shift's close only pushes
  after all its sales have uploaded.

**Golden rule:** do **not** sign out or close the browser tab until the
"Pending Sync" count reaches 0.

---

## 9. Dashboard

The main **Dashboard** (admins) shows the business at a glance, auto-refreshing
every 30 seconds:

**8 KPI cards:**
- **Sales Today** · **Profit Today** · **Cash Today** · **GCash Today**
- **Outstanding Utang** · **Low Stock** (items at or below min)
- **Expenses Today** · **Cash Variance** (from the last shift count)

**Sales Trend** — a **bar graph** of daily sales. Use the top buttons to show
the **last 7 days**, **last 14 days**, or the whole current **month** (default).

Also shown: **Top Products Today** (best sellers) and **Recent Sales**.

> A note may appear if some sales have "unknown cost" — profit is then
> approximate until the cost is entered.

---

## 10. Reports

**Reports** has **10 report tabs**:
- **Sales** · **Profit** · **By Product** · **Receivables** (utang) ·
  **Inventory** · **Voids** · **Z-Reading** · **Sales Detail** ·
  **Cash Flow** · **Consignments**

**Date range:** pick **Daily / Monthly / Yearly** via the period selector,
then set **From** and **To** dates. Each report has a **CSV export** button
(download as a spreadsheet).

---

## 11. Sales History

Every receipt is stored here (`/dashboard/sales`).

- **Filters:** From/To dates, a **Cashier** selector, a **Search** box
  (sale number or item name), and a **Clear** button.
- Each receipt row shows **#** (number), **Cashier**, **Method**, **Total**,
  **Status**, **Time**, and **Actions** (only for `completed` sales):
  - **Print** — reprint the receipt.
  - **Void** — cancel a sale in error.
  - **Refund** — give a refund.

**Void / Refund** open a dialog that requires a **Reason** (be honest — it is
journaled).

---

## 12. Customers & Utang (credit)

Manage customer accounts and their balances (utang).

- **Add Customer:** name (required), **Contact**, **Address**.
- The **Customers** list shows each customer's **Balance (Utang)**.
- Open a customer to see:
  - **Outstanding Balance**.
  - **Unpaid Sales** (each with Total / Paid / Balance).
  - **Payment History**.
  - **Statement of Account** — opens/prints the SOA for that customer.
  - **Record Payment** — enter the amount and money type **Cash / GCash**, tap
    keep. On payment, the app prints a **COLLECTION RECEIPT** automatically.

When you sell on credit (see [Payment](#5-payment-cash--gcash)) the balance is
recorded here automatically.

---

## 13. Items / Products

This is your price list and catalogue.

**Add a product** (`Items` → **Add Product**):
- **Name** (required) and **Category** (from Categories).
- **Sell By** — how it is sold: **Weight (kg)** or **Unit (piece)**.
- **Cost** — what you pay per base unit.
- **Min Stock** — the low-stock reminder level.
- **Tax Rate** — optional, from your tax rates.
- **Status** — **Active / Inactive**.
- **Barcode** — optional, for scanning.
- **Senior/PWD discount** — tick if the item qualifies.
- **Consignment** — tick to mark as a consignment item; then pick the
  **Supplier** and an **Agreed Price** (what the supplier is paid per item
  sold).
- **Selling Units** — add one or more ways to sell it (e.g. `Per kilo`,
  `Sack 50kg`). Each unit has: **Name**, **Base Qty**, **Price**, **Min Qty**,
  **Sort order** and a **Default** marker.

Then tap **Create Product**.

- A brand-new product starts with **0 inventory** — add stock later via
  [Receive a Delivery / Purchase Order](#15-purchase-orders--receive) or an
  [Inventory adjustment](#14-inventory-movements--adjustments).
- **Edit** — tap an item to edit its price, units, etc.
- **Delete** is really **Deactivate** — the item disappears from the POS but
  its stock and history are kept.
- The **Categories** area also lives inside Items (name / order / color).

*(Image upload, ingredients and variants exist on the data side but are not yet
exposed this in this screen.)*

---

## 14. Inventory, Movements & Adjustments

**Item Movements** — for one product’s full history: open **Inventory → the
product → Movements**. Filter by **From / To** date. Each movement shows:
**Date**, **Type/Reason**, **Qty In**, **Qty Out**, **On Hand**, **Cost**,
**Sold Price**, **Ref**, **Employee**.

**Adjust Stock** (Inventory → **Adjust**): choose an item, ends a **type** into
one of exactly 4:
1. **Spoilage**
2. **Damage**
3. **Moisture Loss**
4. **Physical Count** (set the exact counted number)

For spoilage/damage/moisture-loss you enter the **Quantity to remove**; for
physical count you enter the **Actual counted quantity**. Add an optional
**Reason** and tap **Adjust**. The system records the movement and won't let
stock go negative.

**Receive a Delivery** (Inventory → **Receive**): for a supplier sending stock
**outside of a purchase order** — pick the (optional) **Supplier** and the
**Quantity received**. Delivery only adds stock; the **cost** is the one set on
the product.

---

## 15. Purchase Orders & Receive

Use a **Purchase Order (PO)** to order + receive goods from a supplier.

1. Open **Purchase Orders** → **New PO**.
2. Choose the **supplier** and date, and add lines (item, quantity, unit cost).
3. Save — the PO is **Ordered**.
4. When goods arrive, open the PO and tap **Receive** (`Receive into Stock`).
5. Type the **received quantity** for each line (it holds the "remaining" for
   you). You can receive a PO **in parts** — it stays **Partial** until fully
   received, then becomes **Received**.
6. On a receive line option:
   - **Sync cost** — tick to update the product's cost to this PO's price
     (affects your profit). Selling price is never changed.
   - **Consignment** — mark the line as pay-on-when-sold and set the
     **Agreed Price**.
7. The **Total Purchase Cost** is shown; confirm to receive.
8. Other actions: **Cancel PO** (only while ordered) and **Return to Supplier**
   (after received/partial).

PO **statuses**: `ordered — partial — received — cancelled`, each with a
percentage-received column.

---

## 16. Consignments

Consignments = take stock from a supplier **without paying upfront**; the
supplier is paid as items sell. First **mark the item as a Consignment** (see
[Items](#13-items--products)) so it appears under Consignments.

Per consignment item, the header shows **Sold This Period / To Pay / Last
Settled** and the buttons:
- **Receive** → add more consignment stock (a delivery "stock-in").
- **Pull Out** → take stock out and return it to the supplier.
- **Settle** → pay the supplier for what has sold. Shows **Units Sold**,
  **Avg Cost/unit**, **To Pay**; enter a note and **Confirm Settlement**. Only
  appears enabled when there is really something sold to pay.
- **History** → "Settlement History" — date, qty sold, avg unit price, total
  paid, note.

---

## 17. Suppliers

Manage your supplier contacts (used by Purchase Orders and deliveries):
- **Add Supplier** (name, contact, address, notes).
- **Edit / Deactivate** as needed.

---

## 18. Expenses

Record day-to-day costs (utilities, wages, etc.).

- **Add Expense** with **Date**, **Category** (a list of expense categories),
  **Description** (acts as the note), **Amount**.
- Categories you can make are expenses such as Utilities, Rent, Supplies,
  Salary, Load, Transport, Other.
- Expenses appear in your profit and reports.

---

## 19. Categories, Tax Rates & Discounts

- **Categories** group products (Canned goods, Noodles, Beverages…) with a
  name, sort order and color — makes the POS stock nicer to scan.
- **Tax Rates** — a named rate **%** (e.g. VAT 12%) you attach to products.
  Add / edit / delete.
- **Discounts** — named discounts with a **type** (Percentage or Fixed) and a
  **value**. Create/edit/delete (delete deactivates). These are simple
  templates; no date windows.

---

## 20. Staff / Employees

- The **Staff** menu has two sub-tabs: **Employees** and **Shifts**.
- **Employees** (also under Back Office → Employees) lists people that sign in:
  **Name / Role / Status**, with **Add Employee**.
- When adding/editing an employee, choose a **Role** — **Admin** or **Cashier**
  — and a **PIN** (4-digit). For the login above, username+password is used.
- **Deactivate** removes the person's access without deleting their history.
- There is no per-feature permission checklist; Admin vs Cashier is the split.

---

## 21. Shifts (money & GCash report)

The **Shifts** screen (also under Staff → Shifts) lists every **Open / Close**
shift:
- **Open**: **Opening** cash, **Sales**, **Collections**, **Cash Sales**,
  **Expected**, **Balance**.
- **Closed**: additionally **Counted**, **Variance**, and a “BALANCED / OVER /
  SHORT” label.
- **GCash side**: **GCash Opening**, **GCash Sales**, **GCash Expected**, and
  for closed shifts **GCash Counted**.
- Print a shift statement for a closed shift with the **Print** button.

---

## 22. Settings (owner/manager)

**Settings** has 5 tabs. **General** holds:

- **Store Profile** — Business Name, TIN, Address, Contact + **Save Profile**.
- **Bluetooth Printer** — shows the printer name and status, with **Pair
  Printer**, **Test Print**, **Test Drawer**.
- **Cash Drawer** — pick how it is connected:
  - Connected to printer (RJ12 cable)
  - Connected to tablet (USB / OTG)
  - No cash drawer
- **Receipt Options** — **Auto-print** box.
- **Backup & Restore** — **Export All Data** and **Restore**.

The other tabs delegate to: **Discounts**, **Tax Rates**, **Expense
Categories**, and **Audit Log**.

---

## 23. Receipt Printer (Bluetooth)

The system prints receipts to a **Bluetooth receipt printer**.

**Setting up (Settings → Bluetooth Printer):**
1. Tap **Pair Printer** — the browser shows a Bluetooth list; choose the
   printer; confirm.
2. **Test Print** confirms it works; **Test Drawer** pops the cash drawer.

**At the receipt**, tap **Print** — if a Bluetooth printer is connected it
prints directly from the tablet.

**Troubleshooting — set**
- The Web Bluetooth browser only sees **BLE (Bluetooth Low Energy)** printers.
  Many common cash-register printers only speak **classic Bluetooth** and won't
  appear. If your printer does not show in the pairing list, switch to the
  **browser print** method (see below).
- You can always print through the **browser print dialog** by tapping the
  receipt’s **Print** button when no Bluetooth printer is connected — it opens
  the normal print window, where you can pick a system/Bluetooth printer.

---

## 24. Audit Log & Journal

- **Audit Log** — a log of sensitive admin actions. Columns: **Date,
  Employee, Action, Entity, Details** (old → new). Search by action or entity.
  It is intentionally empty until actions occur.
- **Journal** (Electronic Journal) — logs all **sales, voids, refunds, and
  collections**. Columns: **Timestamp, Event, Sale, Details.**

These are for the owner to inspect.

---

## Support & Quick Help

- Refresh the page if a screen looks stuck, and load the app once while online
  so the newest version is cached.
- If you can't see a feature, it may just be a **role** thing (Admin vs
  Cashier), not a bug.
- The app has a "Cash Variance" only for the KPI and **no standalone
  cash-count page** — count money at the **Close Shift** screen.

---

*This manual reflects the system as built. The screens above are the current
labels in the app; if a button is named differently on your build, trust the
on-screen labels.*