"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { LogOutIcon, LayoutDashboardIcon, Search, ShoppingCart, X, Plus, Minus, User, CreditCard, Loader2Icon, BanknoteIcon, DoorOpenIcon, DoorClosedIcon, WifiOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCart, type CartItem } from "@/hooks/use-cart"
import { toast } from "sonner"
import { v4 as uuid } from "uuid"
import { DenominationCounter, type DenomState } from "@/components/denomination-counter"
import { offlineStore } from "@/lib/offline/store"
import { syncNow, hasPending, pendingCount } from "@/lib/offline/sync"
import { allocateGcashFirst } from "@/lib/offline/alloc"

interface CatalogItem {
  id: string; name: string; category_id: string | null; sell_by: "weight" | "unit";
  stock_qty: number; min_stock: number; tax_rate_id: string | null;
  tax_rate: number; discount_eligible: boolean; stock_status: string;
  barcode: string | null;
  units: { id: string; name: string; base_qty: number; price: number; min_qty: number; is_default: boolean }[];
  default_price: number;
}
interface Category { id: string; name: string; sort_order: number }
interface CustomerResult { id: string; name: string; contact?: string; balance?: number }

export default function PosPage() {
  const [{ user, catalog, categories }, setData] = useState<{
    user: { name: string; role: string } | null;
    catalog: CatalogItem[]; categories: Category[];
  }>({ user: null, catalog: [], categories: [] })
  const [search, setSearch] = useState("")
  const [activeCat, setActiveCat] = useState("all")
  const [loading, setLoading] = useState(true)
  const [showCart, setShowCart] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [payCash, setPayCash] = useState("")
  const [payGcash, setPayGcash] = useState("")
  const [deliveryFee, setDeliveryFee] = useState("")
  const [paySaving, setPaySaving] = useState(false)

  // Receipt preview state
  const [receiptData, setReceiptData] = useState<any>(null)
  const [receiptModal, setReceiptModal] = useState(false)

  // Unit picker state
  const [upItem, setUpItem] = useState<CatalogItem | null>(null)
  const [upUnit, setUpUnit] = useState<string>("")
  const [upQty, setUpQty] = useState("1")

  // Customer search state
  const [custModal, setCustModal] = useState(false)
  const [custSearch, setCustSearch] = useState("")
  const [custResults, setCustResults] = useState<CustomerResult[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const cart = useCart()

  // Shift state
  const [shift, setShift] = useState<any>(null)
  const [shiftLoading, setShiftLoading] = useState(true)
  const [shiftOpenModal, setShiftOpenModal] = useState(false)
  const [shiftCloseModal, setShiftCloseModal] = useState(false)
  const [shiftOpenDenoms, setShiftOpenDenoms] = useState<DenomState>({})
  const [shiftOpenTotal, setShiftOpenTotal] = useState(0)
  const [shiftOpenGcash, setShiftOpenGcash] = useState("0")
  const [shiftCloseDenoms, setShiftCloseDenoms] = useState<DenomState>({})
  const [shiftCloseTotal, setShiftCloseTotal] = useState(0)
  const [shiftCloseGcash, setShiftCloseGcash] = useState("0")
  const [shiftCloseNote, setShiftCloseNote] = useState("")
  const [shiftSaving, setShiftSaving] = useState(false)
  const [syncIssues, setSyncIssues] = useState(0)
  const [syncModal, setSyncModal] = useState(false)

  const [collModal, setCollModal] = useState(false)
  const [collSearch, setCollSearch] = useState("")
  const [collResults, setCollResults] = useState<CustomerResult[]>([])
  const [collSelected, setCollSelected] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [collAmount, setCollAmount] = useState("")
  const [collMethod, setCollMethod] = useState("cash")
  const [collSaving, setCollSaving] = useState(false)
  const [storeName, setStoreName] = useState("")

  // Store profile — used on receipt headers; cached so offline receipts still print the name
  useEffect(() => {
    fetch("/api/backoffice/store").then(r => r.json()).then(d => {
      if (d.store?.name) {
        setStoreName(d.store.name)
        offlineStore.setStoreName(d.store.name)
      }
    }).catch(() => {
      const cached = offlineStore.getStoreName()
      if (cached) setStoreName(cached)
    })
  }, [])

  // Auth — cache the session when online so offline boot can still identify the cashier
  useEffect(() => {
    fetch("/api/pos/me").then(r => r.json()).then(d => {
      if (d.employee) {
        setData(prev => ({ ...prev, user: d.employee }))
        offlineStore.setSession({ employee: d.employee, storeId: d.storeId })
      } else {
        router.push("/auth/login")
      }
    }).catch(() => {
      const cached = offlineStore.getSession()
      if (cached?.employee) setData(prev => ({ ...prev, user: cached.employee }))
      else router.push("/auth/login")
    })
  }, [router])

  // Catalog — fall back to the cached snapshot when offline
  useEffect(() => {
    Promise.all([
      fetch("/api/catalog").then(r => r.json()),
      fetch("/api/backoffice/categories").then(r => r.json()),
    ]).then(([catJson, catCatJson]) => {
      const items = catJson.items ?? []
      const cats = catCatJson.categories ?? []
      setData(prev => ({ ...prev, catalog: items, categories: cats }))
      offlineStore.setCatalog(items)
      offlineStore.setCategories(cats)
      setLoading(false)
    }).catch(() => {
      setData(prev => ({ ...prev, catalog: offlineStore.getCatalog() as CatalogItem[], categories: offlineStore.getCategories() as Category[] }))
      setLoading(false)
    })
  }, [])

  // Load current shift — server is authoritative only when nothing is pending
  // locally; overwriting the clientShift ledger mid-sync would erase unsynced
  // offline sales from the close variance.
  const loadShift = useCallback(() => {
    return fetch("/api/shifts").then(r => r.json()).then(d => {
      const s = d.shift ?? null
      setShift(s)
      if (offlineStore.getQueue().length === 0) {
        if (s) {
          offlineStore.setClientShift({
            openedAt: s.opened_at,
            openingCash: Number(s.opening_cash),
            openingGcash: Number(s.opening_gcash || 0),
            cashSales: Number(s.cash_sales || 0),
            gcashSales: Number(s.gcash_sales || 0),
            cashCollections: Number(s.cash_collections || 0),
            gcashCollections: Number(s.gcash_collections || 0),
            openSynced: true,
          })
        } else {
          // Server has no open shift. Keep a local shift that was opened offline
          // and never synced (openSynced:false) — its open POST may still be
          // pending; wiping it would silently erase the shift.
          const cs = offlineStore.getClientShift()
          if (cs && cs.openSynced === false && cs.closingCash === undefined) {
            setShift({
              opened_at: cs.openedAt,
              opening_cash: cs.openingCash,
              opening_gcash: cs.openingGcash,
              cash_sales: cs.cashSales,
              gcash_sales: cs.gcashSales,
              cash_collections: cs.cashCollections,
              gcash_collections: cs.gcashCollections,
              expected_cash: cs.openingCash + cs.cashSales + cs.cashCollections,
              expected_gcash: cs.openingGcash + cs.gcashSales + cs.gcashCollections,
            })
          } else {
            offlineStore.setClientShift(null)
          }
        }
      }
      setShiftLoading(false)
    }).catch(() => {
      // Offline: reconstruct the shift view from the local ledger
      const cs = offlineStore.getClientShift()
      if (cs && cs.closingCash === undefined) {
        setShift({
          opened_at: cs.openedAt,
          opening_cash: cs.openingCash,
          opening_gcash: cs.openingGcash,
          cash_sales: cs.cashSales,
          gcash_sales: cs.gcashSales,
          cash_collections: cs.cashCollections,
          gcash_collections: cs.gcashCollections,
          expected_cash: cs.openingCash + cs.cashSales + cs.cashCollections,
          expected_gcash: cs.openingGcash + cs.gcashSales + cs.gcashCollections,
        })
      }
      setShiftLoading(false)
    })
  }, [])
  useEffect(() => { loadShift() }, [loadShift])

  async function openShift() {
    if (shiftOpenTotal < 0) { toast.error("Enter opening cash"); return }
    // A previous offline close is still pending sync — never clobber it
    if (offlineStore.getClientShift()?.closingCash !== undefined) {
      const { synced } = await syncNow()
      if (offlineStore.getClientShift()?.closingCash !== undefined) {
        toast.error("Previous shift close still pending sync"); return
      }
      if (synced > 0) toast.success(`Synced ${synced} offline item(s)`)
    }
    setShiftSaving(true)
    try {
      const res = await fetch("/api/shifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_cash: shiftOpenTotal, opening_denoms: shiftOpenDenoms, opening_gcash: Number(shiftOpenGcash) || 0 }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || "Failed to open shift"); setShiftSaving(false); return }
      toast.success(`Shift opened — starting cash ₱${shiftOpenTotal.toFixed(2)}`)
      setShiftSaving(false); setShiftOpenModal(false); setShiftOpenDenoms({}); setShiftOpenTotal(0); setShiftOpenGcash("0")
      await loadShift()
    } catch {
      // Offline: record the opening locally; sync will POST it when back online
      offlineStore.setClientShift({
        openedAt: new Date().toISOString(),
        openingCash: shiftOpenTotal,
        openingDenoms: shiftOpenDenoms,
        openingGcash: Number(shiftOpenGcash) || 0,
        cashSales: 0, gcashSales: 0, cashCollections: 0, gcashCollections: 0,
        openSynced: false,
      })
      setShift({
        opened_at: new Date().toISOString(),
        opening_cash: shiftOpenTotal,
        opening_gcash: Number(shiftOpenGcash) || 0,
        cash_sales: 0, gcash_sales: 0, cash_collections: 0, gcash_collections: 0,
        expected_cash: shiftOpenTotal,
        expected_gcash: Number(shiftOpenGcash) || 0,
      })
      toast.success(`Shift opened offline — will sync when back online`)
      setShiftSaving(false); setShiftOpenModal(false); setShiftOpenDenoms({}); setShiftOpenTotal(0); setShiftOpenGcash("0")
    }
  }

  async function openCloseShiftModal() {
    // Never let the cashier close while offline sales are still pending — the
    // server computes expected cash from sales already in the DB, so closing
    // early would lock unsynced sales out of the shift's figures forever.
    if (offlineStore.getQueue().length > 0) {
      const { synced } = await syncNow()
      if (offlineStore.getQueue().length > 0) {
        toast.error(`${offlineStore.getQueue().length} offline sale(s) still pending sync`)
        return
      }
      if (synced > 0) toast.success(`Synced ${synced} offline sale(s)`)
    }
    // Refresh shift to get latest expected cash
    await loadShift()
    setShiftCloseDenoms({}); setShiftCloseTotal(0); setShiftCloseNote(""); setShiftCloseGcash("0")
    setShiftCloseModal(true)
  }

  async function closeShift() {
    setShiftSaving(true)
    try {
      const res = await fetch("/api/shifts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_cash: shiftCloseTotal, closing_denoms: shiftCloseDenoms, note: shiftCloseNote, closing_gcash: Number(shiftCloseGcash) || 0 }),
      })
      const json = await res.json()
      if (!res.ok) {
        // The server never received this shift's open (it was opened offline and
        // the open hasn't synced). Fall back to recording the close locally —
        // the sync order (OPEN → SALES → CLOSE) will post both together.
        if (res.status === 400 && /no open shift/i.test(json.error || "") && offlineStore.getClientShift()) {
          finalizeOfflineClose()
          return
        }
        toast.error(json.error || "Failed to close shift"); setShiftSaving(false); return
      }
      const s = json.shift
      // Print close report
      printShiftReport(s)
      toast.success(`Shift closed. Variance: ${s.variance >= 0 ? "+" : ""}₱${Number(s.variance).toFixed(2)}`)
      offlineStore.setClientShift(null)
      setShiftSaving(false); setShiftCloseModal(false)
      await loadShift()
    } catch {
      // Offline: record closing figures locally; sync will PUT close when back online
      finalizeOfflineClose()
    }
  }

  function finalizeOfflineClose() {
    const cs = offlineStore.getClientShift()
    if (!cs) { toast.error("No open shift to close"); setShiftSaving(false); return }
    const expected = cs.openingCash + cs.cashSales + cs.cashCollections
    const variance = Math.round((shiftCloseTotal - expected + 1e-12) * 100) / 100
    offlineStore.setClientShift({
      ...cs,
      closingCash: shiftCloseTotal,
      closingGcash: Number(shiftCloseGcash) || 0,
      closingDenoms: shiftCloseDenoms,
      note: shiftCloseNote,
    })
    // Print close report using local ledger figures
    printShiftReport({
      opened_at: cs.openedAt,
      closed_at: new Date().toISOString(),
      opening_cash: cs.openingCash,
      cash_sales: cs.cashSales,
      cash_collections: cs.cashCollections,
      expected_cash: expected,
      closing_cash: shiftCloseTotal,
      variance,
      opening_gcash: cs.openingGcash,
      gcash_sales: cs.gcashSales,
      closing_gcash: Number(shiftCloseGcash) || 0,
      closing_denoms: shiftCloseDenoms,
      note: shiftCloseNote,
    })
    toast.success(`Shift closed offline — will sync. Variance: ${variance >= 0 ? "+" : ""}₱${variance.toFixed(2)}`)
    setShift(null)
    setShiftSaving(false); setShiftCloseModal(false)
  }

  function printShiftReport(s: any) {
    const w = window.open("", "shift", "width=320,height=700")
    if (!w) return
    const denomRows = (obj: any) => Object.keys(obj || {}).filter(k => obj[k] > 0)
      .sort((a, b) => Number(b) - Number(a))
      .map(k => `<tr><td>₱${Number(k).toLocaleString()}</td><td style="text-align:center">x${obj[k]}</td><td style="text-align:right">₱${(Number(k) * obj[k]).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`).join("")
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shift Report</title>
    <style>@page{size:80mm auto;margin:4mm}body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;color:#000}.c{text-align:center}.line{border-top:1px dashed #000;margin:4px 0}table{width:100%;border-collapse:collapse}td{font-size:11px;padding:1px 2px}</style>
    </head><body onload="setTimeout(()=>window.print(),300)">
      <div class="c"><strong style="font-size:14px">${storeName || "GroceryPOS"}</strong><br/><span style="font-size:10px">SHIFT CASH REPORT</span></div>
      <div class="line"></div>
      <div style="font-size:10px">Cashier: ${user?.name || ""}<br/>Opened: ${new Date(s.opened_at).toLocaleString("en-PH")}<br/>Closed: ${new Date(s.closed_at).toLocaleString("en-PH")}</div>
      <div class="line"></div>
      <table>
        <tr><td>Opening Cash</td><td></td><td style="text-align:right">₱${Number(s.opening_cash).toFixed(2)}</td></tr>
        <tr><td>Cash Sales</td><td></td><td style="text-align:right">₱${Number(s.cash_sales).toFixed(2)}</td></tr>
        <tr><td>Cash Collections</td><td></td><td style="text-align:right">₱${Number(s.cash_collections).toFixed(2)}</td></tr>
        <tr><td colspan="2"><strong>Expected Cash</strong></td><td style="text-align:right"><strong>₱${Number(s.expected_cash).toFixed(2)}</strong></td></tr>
        <tr><td colspan="2"><strong>Counted Cash</strong></td><td style="text-align:right"><strong>₱${Number(s.closing_cash).toFixed(2)}</strong></td></tr>
        <tr><td colspan="2"><strong>VARIANCE</strong></td><td style="text-align:right"><strong>${s.variance >= 0 ? "+" : ""}₱${Number(s.variance).toFixed(2)}</strong></td></tr>
      </table>
      <div class="line"></div>
      <table>
        <tr><td>GCash Opening</td><td></td><td style="text-align:right">₱${Number(s.opening_gcash).toFixed(2)}</td></tr>
        <tr><td>GCash Sales</td><td></td><td style="text-align:right">₱${Number(s.gcash_sales).toFixed(2)}</td></tr>
        <tr><td>GCash Closing</td><td></td><td style="text-align:right">₱${Number(s.closing_gcash).toFixed(2)}</td></tr>
        <tr><td colspan="2"><strong>Expected GCash</strong></td><td style="text-align:right"><strong>₱${(Number(s.opening_gcash) + Number(s.gcash_sales)).toFixed(2)}</strong></td></tr>
      </table>
      <div class="line"></div>
      <div class="c" style="font-size:10px"><strong>CLOSING DENOMINATIONS</strong></div>
      <table>${denomRows(s.closing_denoms)}</table>
      <div class="line"></div>
      ${s.note ? `<div style="font-size:10px">Note: ${s.note}</div>` : ""}
      <div class="c" style="font-size:10px;margin-top:8px">— End of Shift —</div>
    </body></html>`)
    w.document.close()
  }

  // Barcode scanner — dual capture: hidden input (hardware numpad) + window listener (software keyboard)
  useEffect(() => {
    scanRef.current?.focus()
    let buf = ""; let t: NodeJS.Timeout | null = null
    const h = (e: KeyboardEvent) => {
      if (payModal || upItem || custModal) return
      if (e.target === scanRef.current) return
      if (e.key === "Enter" && buf.length >= 8) { scanBarcode(buf); buf = ""; return }
      if (e.key.length === 1) { buf += e.key; if (t) clearTimeout(t); t = setTimeout(() => { buf = "" }, 80) }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [payModal, upItem, custModal])

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const code = e.currentTarget.value.trim()
      if (code.length >= 8) { scanBarcode(code); e.currentTarget.value = "" }
    }
  }

  // Re-focus scan input after modals close
  useEffect(() => {
    if (!payModal && !upItem && !custModal && !collModal)
      setTimeout(() => scanRef.current?.focus(), 150)
  }, [payModal, upItem, custModal, collModal])

  // Auto-sync: on mount and whenever connectivity returns
  useEffect(() => {
    const run = async () => {
      if (!hasPending()) return
      const { synced, failed } = await syncNow()
      setSyncIssues(pendingCount())
      if (synced > 0) loadShift()
      if (failed > 0) {
        const err = offlineStore.getLastError()
        toast.error(err ? `Sync failed: ${err.message}` : "Some offline items couldn't sync yet")
      }
    }
    run()
    const onOnline = () => { run() }
    const onOffline = () => {
      if (hasPending()) setSyncIssues(pendingCount())
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [loadShift])

  function scanBarcode(code: string) {
    fetch(`/api/backoffice/items?q=${code}`).then(r => r.json()).then(d => {
      const match = (d.items ?? []).find((i: any) => i.barcode === code)
      if (match) {
        const catItem = catalog.find(c => c.id === match.id)
        if (catItem) openUnitPicker(catItem)
        else toast("Product found but not in active catalog")
      } else {
        toast.error(`Barcode ${code} not found`)
      }
    }).catch(() => {
      // Offline — fall back to the cached catalog
      const catItem = catalog.find(c => c.barcode === code)
      if (catItem) openUnitPicker(catItem)
      else toast.error(`Barcode ${code} not found (offline)`)
    })
  }

  function openUnitPicker(item: CatalogItem) {
    if (item.stock_status === "out") return
    if (!shift) { toast.error("Open a shift first before selling"); setShiftOpenModal(true); return }
    const d = item.units.find(u => u.is_default) ?? item.units[0]
    setUpItem(item); setUpUnit(d?.id ?? ""); setUpQty("1")
  }

  function addToCart() {
    if (!upItem || !upUnit) return
    const unit = upItem.units.find(u => u.id === upUnit)
    if (!unit) return
    const qty = Number(upQty)
    if (!qty || qty <= 0) return
    if (upItem.sell_by === "unit" && qty % 1 !== 0) {
      toast.error("Unit items require whole number quantity")
      return
    }
    if (qty * unit.base_qty > upItem.stock_qty) {
      toast.error(`Only ${Number(upItem.stock_qty).toFixed(upItem.sell_by==="weight"?3:0)} available`)
      return
    }
    cart.addItem({
      itemId: upItem.id, itemName: upItem.name, categoryId: upItem.category_id,
      unitId: unit.id, unitName: unit.name, baseQty: unit.base_qty, qty,
      unitPrice: unit.price, stockQty: upItem.stock_qty,
      sellBy: upItem.sell_by, taxRate: upItem.tax_rate,
      discountEligible: upItem.discount_eligible,
    })
    setUpItem(null)
  }

  // Customer
  function openCustomerSearch() { setCustModal(true); setCustSearch(""); setCustResults([]) }
  function searchCustomers(q: string) {
    setCustSearch(q);
    if (q.length < 1) { setCustResults([]); return }
    fetch(`/api/backoffice/customers?q=${encodeURIComponent(q)}`).then(r => r.json())
      .then(d => setCustResults(d.customers ?? []))
  }

  // Payment
  function openPay() {
    if (!shift) { toast.error("Open a shift first before selling"); setShiftOpenModal(true); return }
    setPayCash(String((cart.total + (Number(deliveryFee) || 0)).toFixed(2)))
    setPayGcash("0")
    setPayModal(true)
  }

  async function processPayment() {
    const round2 = (v: number) => Math.round((v + 1e-12) * 100) / 100
    const cash = round2(Number(payCash) || 0)
    const gcash = round2(Number(payGcash) || 0)
    const fee = round2(Number(deliveryFee) || 0)
    const total = round2(cart.total + fee)
    if (cash + gcash <= 0 && !cart.customerId) {
      toast.error("Enter a payment amount or select a customer for utang"); return
    }
    const paidTotal = cash + gcash
    const isShort = paidTotal < total
    if (isShort && !cart.customerId) {
      toast.error("Select a customer to have a balance"); return
    }
    // Change only ever comes from cash. GCash is a digital transfer — an exact
    // top-up that can never pay for "change", so the un-applied cash tender is
    // the only thing returned. Mirrors the server's gcash-first allocation.
    const gcashApplied = Math.min(gcash, total)
    const cashApplied = Math.min(cash, Math.max(0, total - gcashApplied))
    const change = Math.max(0, cash - cashApplied)
    const balance = isShort ? round2(total - paidTotal) : 0
    const totalPaid = cashApplied + gcashApplied
    // No utang/balance offline — can't verify customer balances without a network
    if (!navigator.onLine && isShort) {
      toast.error("Pay in full — utang is not available offline")
      return
    }

    setPaySaving(true)
    const clientRef = uuid()
    const payments: { method: string; amount: number }[] = []
    if (cash > 0) payments.push({ method: "cash", amount: cash })
    if (gcash > 0) payments.push({ method: "gcash", amount: gcash })

    const body = {
      items: cart.items.map(i => ({ itemId: i.itemId, itemName: i.itemName, unitId: i.unitId, unitName: i.unitName, baseQty: i.baseQty, qty: i.qty, unitPrice: i.unitPrice, discountEligible: i.discountEligible })),
      payments,
      customerId: cart.customerId,
      discountType: cart.discount.type, discountValue: cart.discount.value,
      discountAmount: cart.discountAmount, discountName: cart.discount.name,
      subtotal: Math.round(cart.subtotal * 100) / 100,
      taxTotal: Math.round(cart.taxTotal * 100) / 100,
      deliveryFee: fee,
      total,
      clientRef,
    }

    // Server allocation is GCash-first, cash covers the remainder — mirror it so
    // the clientShift ledger stays in lock-step with DB shift figures.
    const { cashAlloc, gcashAlloc } = allocateGcashFirst(total, cash, gcash)

    const nextOfflineNum = () => {
      const n = offlineStore.getLastOfflineNum() + 1
      offlineStore.setLastOfflineNum(n)
      return `OF-${String(n).padStart(3, "0")}`
    }

    const queueOffline = (ref: string) => {
      offlineStore.setQueue([...offlineStore.getQueue(), { clientRef, body, createdAt: new Date().toISOString(), ref }])
    }

    const bumpLedger = () => {
      const cs = offlineStore.getClientShift()
      if (!cs) return
      const next = { ...cs, cashSales: round2(cs.cashSales + cashAlloc), gcashSales: round2(cs.gcashSales + gcashAlloc) }
      offlineStore.setClientShift(next)
      // Mirror into the on-screen shift chip while a local ledger is driving (offline)
      if (offlineStore.getQueue().length > 0 && shift) {
        setShift({
          ...shift,
          cash_sales: next.cashSales,
          gcash_sales: next.gcashSales,
          expected_cash: round2(next.openingCash + next.cashSales + next.cashCollections),
          expected_gcash: round2(next.openingGcash + next.gcashSales + next.gcashCollections),
        })
      }
    }

    const showReceipt = async (sn: string) => {
      const receiptText = {
        header: storeName || "GroceryPOS",
        subtitle: `Receipt #${sn}`,
        items: cart.items.map(i => ({ name: `${i.itemName} (${i.unitName})`, qty: i.qty, price: i.unitPrice * i.qty })),
        subtotal: Math.round(cart.subtotal * 100) / 100,
        discount: cart.discountAmount,
        tax: cart.taxTotal,
        deliveryFee: fee,
        total,
        paymentMethod: payments.length > 0 ? payments.map(p => `${p.method} ₱${p.amount}`).join(" + ") : "Utang / Balance",
        amountTendered: paidTotal,
        change,
        orderNumber: sn,
        date: new Date().toLocaleString("en-PH"),
        cashier: user?.name || "Cashier",
        footer: "Salamat po! Come again!",
      }
      setReceiptData(receiptText)
      setReceiptModal(true)

      // Auto-print if enabled in Settings (reflected at the saved time of sale)
      try {
        const { getAutoPrint, printReceipt } = await import("@/lib/utils/printer")
        if (getAutoPrint()) await printReceipt(receiptText)
      } catch { /* auto-print best-effort */ }

      // Cash drawer
      if (cash > 0) {
        try {
          const { openCashDrawer } = await import("@/lib/utils/cash-drawer")
          await openCashDrawer()
        } catch { /* drawer failed */ }
      }

      toast.success(`Sale #${sn} — ₱${total.toFixed(2)}`)
      cart.clearCart()
      cart.resumeMostRecentHeld()
      setPayModal(false)
      setPayCash(""); setPayGcash(""); setDeliveryFee("")
    }

    const finalizeOffline = () => {
      const ref = nextOfflineNum()
      queueOffline(ref)
      bumpLedger()
      setSyncIssues(prev => prev + 1)
      void showReceipt(ref)
    }

    try {
      const res = await fetch("/api/sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      // 4xx = server rejected (bad stock, validation) — show error, keep cart
      if (res.status >= 400 && res.status < 500) {
        const json = await res.json()
        toast.error(json.error || "Sale failed"); setPaySaving(false); return
      }
      // Network failure or 5xx — the sale may or may not have committed server-side.
      // Queue it with the same clientRef so a replay is idempotent (no double-sell).
      if (!res.ok) {
        finalizeOffline()
        setPaySaving(false)
        return
      }
      const json = await res.json()
      if (!json.sale) { toast.error("Sale failed"); setPaySaving(false); return }

      const sn = String(json.sale.sale_number).padStart(6, "0")
      showReceipt(sn)
      bumpLedger()

      // Refresh catalog to update stock
      fetch("/api/catalog").then(r => r.json()).then(d => {
        const items = d.items ?? []
        setData(prev => ({ ...prev, catalog: items }))
        offlineStore.setCatalog(items)
      }).catch(() => {})
    } catch {
      // Fetch threw — offline or network dropped mid-flight. Queue idempotently.
      finalizeOffline()
    }
    setPaySaving(false)
  }

  async function retrySync() {
    const { failed } = await syncNow()
    setSyncIssues(pendingCount())
    if (failed > 0) {
      const err = offlineStore.getLastError()
      toast.error(err ? `Sync failed: ${err.message}` : "Some offline items couldn't sync yet")
    } else {
      setSyncModal(false)
      loadShift()
      toast.success("All offline items synced")
    }
  }

  function discardQueued(clientRef: string) {
    const item = offlineStore.getQueue().find(q => q.clientRef === clientRef)
    const label = item?.ref ? `receipt ${item.ref}` : `sale ${clientRef.slice(0, 8)}`
    if (!window.confirm(`Discard ${label}? This sale will NOT be recorded in the system. Continue?`)) return
    offlineStore.setQueue(offlineStore.getQueue().filter(q => q.clientRef !== clientRef))
    setSyncIssues(pendingCount())
  }

  const discountOptions = [
    { value: "none", label: "No Discount" },
    { value: "senior", label: "Senior 20%" },
    { value: "pwd", label: "PWD 20%" },
  ]

  const filtered = catalog.filter(i => {
    if (activeCat !== "all" && i.category_id !== activeCat) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const riceCatId = categories.find(c => c.name.toLowerCase() === "rice")?.id
  const showSplit = activeCat === "all" && riceCatId
  const riceItems = showSplit ? filtered.filter(i => i.category_id === riceCatId) : []
  const otherItems = showSplit ? filtered.filter(i => i.category_id !== riceCatId) : filtered

  const renderItem = (item: CatalogItem) => (
    <button key={item.id} onClick={() => openUnitPicker(item)} disabled={item.stock_status==="out"}
      className={`relative flex flex-col items-center p-3 rounded-xl border transition-all text-left ${item.stock_status==="out"?"bg-stone-100 border-amber-300/60 opacity-50 cursor-not-allowed":"bg-gold-200/60 border-amber-300/60 hover:border-amber-500 hover:bg-gold-100 cursor-pointer"}`}>
      {item.stock_status==="out"&&<Badge className="absolute top-1 right-1 text-[10px] bg-red-500">OUT</Badge>}
      {item.stock_status==="low"&&<Badge className="absolute top-1 right-1 text-[10px] bg-gold-200 text-amber-700">LOW</Badge>}
      <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center mb-2">
        <span className="text-lg">{item.sell_by==="weight"?"⚖":"📦"}</span>
      </div>
      <span className="text-xs font-medium text-stone-800 text-center leading-tight line-clamp-2">{item.name}</span>
      <span className="text-xs text-amber-600 mt-1 font-semibold">₱{Number(item.default_price).toFixed(2)}</span>
      <span className="text-[10px] text-stone-500 mt-0.5">Stock: {Number(item.stock_qty).toFixed(item.sell_by==="weight"?1:0)}</span>
    </button>
  )

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/auth/login")
  }

  if (!user) return (
    <div className="flex h-screen items-center justify-center rices-bg">
      <Loader2Icon className="h-8 w-8 animate-spin text-amber-600" />
    </div>
  )

  return (
    <div className="flex h-screen flex-col rices-bg">
      <input ref={scanRef} onKeyDown={handleScanKeyDown}
        className="absolute left-0 top-0 w-[1px] h-[1px] opacity-0 -z-10"
        autoComplete="off" inputMode="none" tabIndex={0}
        aria-hidden="true"
      />
      {/* ══ HEADER — same theme as admin shell ══ */}
      <header className="relative z-10 flex items-center justify-between border-b border-amber-300/60 bg-gradient-to-r from-[#0D3B1E]/95 via-[#0D3B1E]/95 to-[#1B4D2E]/95 px-3 sm:px-4 py-3 text-white shrink-0 shadow-md">
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent animate-gold-shimmer bg-[length:200%_100%]" />
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-white/15 ring-1 ring-amber-400/20 overflow-hidden">
            <img src="/new logo.png" alt="Kabayan Mart" className="h-full w-full object-contain p-0.5" />
          </div>
          <div>
            <h1 className="hidden sm:block text-sm sm:text-base font-bold leading-tight tracking-tight truncate">{storeName || "GroceryPOS"}</h1>
            <p className="hidden sm:block text-[0.6rem] sm:text-[0.7rem] font-medium text-amber-600 leading-tight">Point of Sale</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shift ? (
            <button onClick={openCloseShiftModal} className="flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-xs font-medium text-green-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition-all" title="Close Shift">
              <DoorClosedIcon className="h-3.5 w-3.5" /> Shift Open · Close
            </button>
          ) : (
            <button onClick={() => { setShiftOpenDenoms({}); setShiftOpenTotal(0); setShiftOpenModal(true) }} className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/25 transition-all">
              <DoorOpenIcon className="h-3.5 w-3.5" /> Open Shift
            </button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-2 sm:px-3 py-1">
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline text-xs sm:text-sm font-semibold text-amber-500 truncate max-w-[80px]">{user.name}</span>
          </div>
          {syncIssues > 0 && (
            <button onClick={() => setSyncModal(true)}
              className="flex items-center gap-1.5 rounded-full border border-red-400/50 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-all" title="View pending offline sync">
              <WifiOffIcon className="h-3.5 w-3.5" /> Pending Sync ({syncIssues})
            </button>
          )}
          {user.role === "admin" && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary hover:bg-primary/20 hover:text-primary" onClick={() => router.push("/dashboard")}>
              <LayoutDashboardIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" onClick={() => { setCollModal(true); setCollSearch(""); setCollResults([]) }} title="Collections">
            <BanknoteIcon className="h-4 w-4" />
          </Button>
          <button onClick={handleLogout} className="rounded-full border border-primary/30 bg-primary/15 p-2 text-primary hover:bg-red-500/30 hover:text-white transition-all" title="Logout">
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ══ PRODUCT GRID ══ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
              <Input ref={searchRef} placeholder="Search or scan barcode..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-gold-100 border-amber-300/60 text-stone-800 h-9" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button onClick={() => setActiveCat("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCat==="all"?"bg-primary text-primary-foreground":"bg-gold-100 text-stone-500 hover:text-stone-800"}`}>All</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setActiveCat(c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCat===c.id?"bg-primary text-primary-foreground":"bg-gold-100 text-stone-600 hover:text-stone-800"}`}>{c.name}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-stone-500">Loading catalog...</div>
          ) : (
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {showSplit ? (
                  <>
                    {riceItems.length > 0 && (
                      <>
                        <div className="col-span-full flex items-center gap-2 mt-1 mb-1">
                          <span className="text-xs font-bold text-amber-600 tracking-wider uppercase">Rice</span>
                          <div className="flex-1 h-px bg-primary/30" />
                        </div>
                        {riceItems.map(item => renderItem(item))}
                      </>
                    )}
                    {otherItems.length > 0 && (
                      <>
                        <div className="col-span-full flex items-center gap-2 mt-3 mb-1">
                          <span className="text-xs font-bold text-stone-500 tracking-wider uppercase">Other Items</span>
                          <div className="flex-1 h-px bg-stone-600/20" />
                        </div>
                        {otherItems.map(item => renderItem(item))}
                      </>
                    )}
                    {filtered.length === 0 && <div className="col-span-full text-center text-stone-500 py-12">No products found</div>}
                  </>
                ) : (
                  <>
                    {filtered.map(item => renderItem(item))}
                    {filtered.length === 0 && <div className="col-span-full text-center text-stone-500 py-12">No products found</div>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══ CART SIDEBAR ══ */}
        <div className={`${showCart?"fixed inset-0 z-40":"hidden"} lg:relative lg:flex lg:z-0 w-full lg:w-[380px] flex-col border-l border-amber-300/60 bg-gold-200/90 shrink-0`}>
          <div className="flex items-center justify-between p-3 border-b border-amber-300/60">
            <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-amber-600"/><span className="font-semibold text-stone-800 text-sm">Cart ({cart.items.length})</span></div>
            <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={()=>setShowCart(false)}><X className="h-4 w-4"/></Button>
          </div>
          {cart.heldCarts.length > 0 && (
            <div className="p-2 pb-0">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider shrink-0">Held ({cart.heldCarts.length})</span>
                {cart.heldCarts.map(h => (
                  <button key={h.id} onClick={() => cart.resumeCart(h.id)}
                    className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 border border-amber-400/40 hover:bg-amber-500/25 flex items-center gap-1">
                    <User className="h-3 w-3" />{h.label}
                    <span className="text-[10px] text-stone-500">({h.items.length})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cart.items.length===0?<div className="text-center text-stone-500 py-8 text-sm">Cart is empty</div>:cart.items.map(item=>{const k=cart.mergeKey(item);return(
              <div key={k} className="flex items-center gap-2 bg-gold-200/50 rounded-lg p-2">
                <div className="flex-1 min-w-0"><p className="text-xs font-medium text-stone-800 truncate">{item.itemName}</p><p className="text-[10px] text-stone-500">{item.unitName} · ₱{Number(item.unitPrice).toFixed(2)}</p></div>
                <div className="flex items-center gap-1">
                  <button onClick={()=>cart.updateQty(k,item.qty-(item.sellBy==="weight"?0.1:1))} className="h-6 w-6 rounded bg-white flex items-center justify-center btnQuantity text-stone-500 hover:text-stone-800"><Minus className="h-3 w-3"/></button>
                  <span className="text-xs font-medium text-stone-800 w-10 text-center">{item.sellBy==="weight"?Number(item.qty).toFixed(item.qty%1===0?1:3):item.qty}</span>
                  <button onClick={()=>{ const step=item.sellBy==="weight"?0.1:1; const next=item.qty+step; if(next*item.baseQty>item.stockQty){toast.error(`Only ${Number(item.stockQty).toFixed(item.sellBy==="weight"?1:0)} available`); return } cart.updateQty(k,next) }} className="h-6 w-6 rounded bg-white flex items-center justify-center btnQuantity text-stone-500 hover:text-stone-800"><Plus className="h-3 w-3"/></button>
                </div>
                <button onClick={()=>cart.removeItem(k)} className="h-6 w-6 rounded flex items-center justify-center text-stone-500 hover:text-red-600"><X className="h-3 w-3"/></button>
              </div>
            )})}
          </div>
          <div className="border-t border-amber-300/60 p-3 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Discount:</span>
              <Select value={cart.discount.type??"none"} onValueChange={v=>{if(v==="none")cart.setDiscount({type:null,value:0,name:""});else if(v==="senior")cart.setDiscount({type:"senior",value:20,name:"Senior 20%"});else if(v==="pwd")cart.setDiscount({type:"pwd",value:20,name:"PWD 20%"})}}>
                <SelectTrigger className="h-7 text-xs w-[140px] bg-gold-100 border-amber-300/60"><SelectValue placeholder="No Discount"/></SelectTrigger>
                <SelectContent>{discountOptions.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Customer:</span>
              {cart.customerId?<button onClick={openCustomerSearch} className="flex items-center gap-1 text-xs text-primary hover:text-primary"><User className="h-3 w-3"/>{cart.customerName}{cart.customerBalance>0&&<span className="text-primary">(utang: ₱{cart.customerBalance.toFixed(2)})</span>}</button>:<button onClick={openCustomerSearch} className="text-xs text-stone-500 hover:text-stone-700">Walk-in ▾</button>}
            </div>
            <div className="space-y-0.5 text-xs border-t border-amber-300/60 pt-2">
              <div className="flex justify-between text-stone-500"><span>Subtotal</span><span>₱{cart.subtotal.toFixed(2)}</span></div>
              {cart.discountAmount>0&&<div className="flex justify-between text-red-600"><span>{cart.discount.name}</span><span>-₱{cart.discountAmount.toFixed(2)}</span></div>}
              <div className="flex justify-between text-stone-500"><span>Tax</span><span>₱{cart.taxTotal.toFixed(2)}</span></div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500">Delivery Fee</span>
                <Input type="number" step="0.01" min="0" placeholder="0.00"
                  value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)}
                  className="w-24 h-7 text-right bg-gold-100 border-amber-300/60 text-xs" />
              </div>
              <div className="flex justify-between text-base font-bold text-stone-800 pt-1"><span>TOTAL</span><span>₱{(cart.total + (Number(deliveryFee) || 0)).toFixed(2)}</span></div>
            </div>
            <div className="flex gap-2">
               <Button variant="outline" size="sm" className="flex-1" onClick={cart.clearCart} disabled={cart.items.length===0}>Clear</Button>
               <Button variant="outline" size="sm" className="flex-1" onClick={cart.holdCurrentCart} disabled={cart.items.length===0} title="Park this cart for later"><ShoppingCart className="h-3 w-3 mr-1"/>Hold</Button>
               <Button size="sm" className="flex-1 bg-primary hover:bg-amber-400" disabled={cart.items.length===0} onClick={openPay}><CreditCard className="h-3 w-3 mr-1"/>Pay</Button>
            </div>
          </div>
        </div>

        {/* Mobile cart toggle */}
        <button onClick={()=>setShowCart(true)} className="lg:hidden fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center">
          <ShoppingCart className="h-6 w-6"/>{cart.items.length>0&&<span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">{cart.items.length}</span>}
        </button>
      </div>

      {/* ══ UNIT PICKER ══ */}
      <Dialog open={!!upItem} onOpenChange={()=>setUpItem(null)}>
        <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle>{upItem?.name}</DialogTitle></DialogHeader>
          {upItem&&(<div className="space-y-5">
            <p className="text-xs text-stone-500">Available: {Number(upItem.stock_qty).toFixed(upItem.sell_by==="weight"?1:0)} {upItem.sell_by==="weight"?"kg":"pcs"}</p>
            <div className="space-y-1.5">
              {upItem.units.map(u=>(<label key={u.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer border ${upUnit===u.id?"border-amber-500 bg-amber-500/10":"border-amber-300/60 bg-gold-100"}`}>
                <input type="radio" name="unit" value={u.id} checked={upUnit===u.id} onChange={()=>{setUpUnit(u.id);setUpQty("1")}} className="accent-amber-500"/>
                <div className="flex-1"><span className="text-sm font-medium">{u.name}</span><span className="text-xs text-stone-500 ml-2">({u.base_qty} {upItem.sell_by==="weight"?"kg":"pc"} base)</span></div>
                <span className="text-sm font-bold text-amber-600">₱{Number(u.price).toFixed(2)}</span>
              </label>))}
            </div>
            <div className="space-y-1.5 mb-1">
              <span className="text-xs font-medium text-stone-500 mb-1">Quantity:</span>
              <Input
                type="number"
                inputMode="decimal"
                value={upQty}
                onChange={e => setUpQty(e.target.value)}
                className="bg-gold-100 border-amber-300/60 h-12 text-lg font-mono"
              />
            </div>
            {upUnit&&(<p className="text-xs text-stone-500">Total: {(Number(upQty||0)*(upItem.units.find(u=>u.id===upUnit)?.base_qty??1)).toFixed(upItem.sell_by==="weight"?1:0)} {upItem.sell_by==="weight"?"kg":"pcs"} = ₱{(Number(upQty||0)*(upItem.units.find(u=>u.id===upUnit)?.price??0)).toFixed(2)}</p>)}
            <Button onClick={addToCart} className="w-full bg-primary hover:bg-amber-400">Add to Cart</Button>
          </div>)}
        </DialogContent>
      </Dialog>

      {/* ══ CUSTOMER SEARCH ══ */}
      <Dialog open={custModal} onOpenChange={setCustModal}>
        <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5"><DialogHeader><DialogTitle>Select Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Search customer..." value={custSearch} onChange={e=>searchCustomers(e.target.value)} className="bg-gold-100 border-amber-300/60"/>
            <button onClick={()=>{cart.setCustomer(null,"",0);setCustModal(false)}} className="w-full text-left p-2 rounded bg-gold-100 text-sm text-stone-500 hover:bg-white">Walk-in (no customer)</button>
            {custResults.map(c=>(<button key={c.id} onClick={()=>{cart.setCustomer(c.id,c.name,c.balance??0);setCustModal(false)}} className="w-full text-left p-2 rounded bg-gold-100 text-sm hover:bg-white">
               <div className="font-medium text-stone-800">{c.name}</div><div className="text-xs text-stone-500">{c.contact ? `${c.contact}` : ""}</div>
              {c.balance!==undefined&&c.balance>0&&<div className="text-xs text-amber-600">Utang: ₱{c.balance.toFixed(2)}</div>}
            </button>))}
          </div></DialogContent>
      </Dialog>

      {/* ══ PAYMENT OVERLAY ══ */}
      <Dialog open={payModal} onOpenChange={setPayModal}>
          <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle>Payment</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {(() => { const payTotal = cart.total + (Number(deliveryFee) || 0); return (<>
            <p className="text-center"><span className="text-3xl font-bold text-white">₱{payTotal.toFixed(2)}</span></p>
            <div className="space-y-3">
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">Cash</label>
              <Input
                type="number"
                inputMode="decimal"
                value={payCash}
                onChange={e => setPayCash(e.target.value)}
                className="bg-gold-100 border-amber-300/60 h-12 text-lg font-mono"
              />
              </div>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">GCash</label>
              <Input
                type="number"
                inputMode="decimal"
                value={payGcash}
                onChange={e => setPayGcash(e.target.value)}
                className="bg-gold-100 border-amber-300/60 h-12 text-lg font-mono"
              />
              </div>
              <div className="border-t border-amber-300/60 pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-stone-500">Paid</span><span className="text-white font-semibold">₱{((Number(payCash)||0)+(Number(payGcash)||0)).toFixed(2)}</span></div>
                {((Number(payCash)||0)+(Number(payGcash)||0))<payTotal&&(<div className="flex justify-between"><span className="text-amber-600">To Balance</span><span className="text-amber-600 font-semibold">₱{(payTotal-(Number(payCash)||0)-(Number(payGcash)||0)).toFixed(2)}</span></div>)}
                {(Number(payCash)||0)+(Number(payGcash)||0)>payTotal&&(<div className="flex justify-between"><span className="text-amber-600">Change</span><span className="text-amber-600 font-semibold">₱{((Number(payCash)||0)+(Number(payGcash)||0)-payTotal).toFixed(2)}</span></div>)}
              </div>
              {cart.customerId&&<div className="text-xs text-stone-500">Customer: {cart.customerName} {cart.customerBalance>0?`(existing utang: ₱${cart.customerBalance.toFixed(2)})`:""}</div>}
              {!cart.customerId&&((Number(payCash)||0)+(Number(payGcash)||0))<payTotal&&<p className="text-xs text-red-600 text-center">Select a customer to have a balance</p>}
            </div>
            </>) })()}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={()=>setPayModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-primary hover:bg-amber-400" onClick={processPayment} disabled={paySaving}>{paySaving?<Loader2Icon className="h-4 w-4 animate-spin"/>:"Confirm Payment"}</Button>
            </div>
          </div></DialogContent>
      </Dialog>

      {/* ══ RECEIPT PREVIEW MODAL ══ */}
      <Dialog open={receiptModal} onOpenChange={setReceiptModal}>
        <DialogContent className="max-w-sm bg-gold-100 text-black font-mono text-sm p-6">
          {receiptData && (
            <div className="space-y-4 text-[13px]">
              {/* Store header */}
              <div className="text-center border-b border-dashed border-gray-300 pb-2">
                <p className="font-bold text-base">{receiptData.header}</p>
                <p className="text-[11px] text-gray-500">{receiptData.subtitle}</p>
              </div>

              {/* Order info */}
              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between"><span>Receipt #:</span><span className="font-semibold">{receiptData.orderNumber}</span></div>
                <div className="flex justify-between"><span>Date:</span><span>{receiptData.date}</span></div>
                <div className="flex justify-between"><span>Cashier:</span><span>{receiptData.cashier}</span></div>
              </div>

              <div className="border-t border-dashed border-gray-300 pt-2" />

              {/* Items */}
              <table className="w-full text-[12px]">
                <tbody>
                  {receiptData.items.map((i: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-0.5">{i.name}</td>
                      <td className="text-center py-0.5">x{i.qty}</td>
                      <td className="text-right py-0.5">₱{i.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-gray-300 pt-1" />

              {/* Totals */}
              <div className="space-y-0.5 text-[12px]">
                <div className="flex justify-between"><span>Subtotal</span><span>₱{receiptData.subtotal.toFixed(2)}</span></div>
                {receiptData.discount > 0 && (
                  <div className="flex justify-between text-red-600"><span>Discount</span><span>-₱{receiptData.discount.toFixed(2)}</span></div>
                )}
                {receiptData.tax > 0 && (
                  <div className="flex justify-between"><span>Tax</span><span>₱{receiptData.tax.toFixed(2)}</span></div>
                )}
                {receiptData.deliveryFee > 0 && (
                  <div className="flex justify-between"><span>Delivery Fee</span><span>₱{receiptData.deliveryFee.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>TOTAL</span><span>₱{receiptData.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 pt-1" />

              {/* Payment */}
              <div className="text-[12px] space-y-0.5">
                <span>{receiptData.paymentMethod}</span>
                {receiptData.amountTendered > 0 && (
                  <div className="flex justify-between"><span>Tendered</span><span>₱{receiptData.amountTendered.toFixed(2)}</span></div>
                )}
                {receiptData.change > 0 && (
                  <div className="flex justify-between"><span>Change</span><span>₱{receiptData.change.toFixed(2)}</span></div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 pt-2" />

              {/* Footer */}
              <p className="text-center text-[11px]">{receiptData.footer}</p>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 text-black border-gray-300" onClick={async () => {
                  try {
                    const { printReceipt } = await import("@/lib/utils/printer")
                    const ok = await printReceipt(receiptData)
                    if (ok) toast.success("Receipt printing...")
                    else toast.error("Print dialog blocked — use Reprint from Sales History")
                  } catch { toast.error("Print failed — try Reprint from Sales History") }
                }}>
                  Print
                </Button>
                <Button className="flex-1 bg-primary hover:bg-amber-400 text-primary-foreground" onClick={() => { setReceiptModal(false); setReceiptData(null) }}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ OPEN SHIFT MODAL ══ */}
      <Dialog open={shiftOpenModal} onOpenChange={setShiftOpenModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorOpenIcon className="h-5 w-5 text-amber-600" /> Open Shift — Count Starting Cash</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <p className="text-xs text-stone-500">Count the cash in the drawer before you start selling. Enter how many pieces of each denomination.</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">GCash Balance</label>
              <Input type="number" inputMode="decimal" value={shiftOpenGcash} onChange={e => setShiftOpenGcash(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
            </div>
            <DenominationCounter value={shiftOpenDenoms} onChange={(d, t) => { setShiftOpenDenoms(d); setShiftOpenTotal(t) }} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShiftOpenModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-primary hover:bg-amber-400" onClick={openShift} disabled={shiftSaving}>
                {shiftSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : `Open Shift (₱${shiftOpenTotal.toFixed(2)})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ CLOSE SHIFT MODAL ══ */}
      <Dialog open={shiftCloseModal} onOpenChange={setShiftCloseModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorClosedIcon className="h-5 w-5 text-amber-600" /> Close Shift — Count Cash</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {shift && (
              <div className="rounded-lg bg-gold-200/60 border border-amber-300/60 p-3 space-y-1 text-sm">
                <div className="flex justify-between text-stone-500"><span>Opening Cash</span><span>₱{Number(shift.opening_cash).toFixed(2)}</span></div>
                <div className="flex justify-between text-stone-500"><span>Cash Sales</span><span>₱{Number(shift.cash_sales).toFixed(2)}</span></div>
                <div className="flex justify-between text-stone-500"><span>GCash Sales</span><span>₱{Number(shift.gcash_sales).toFixed(2)}</span></div>
                <div className="flex justify-between text-stone-500"><span>Cash Collections</span><span>₱{Number(shift.cash_collections).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-amber-600 border-t border-amber-300/60 pt-1"><span>Expected in Drawer</span><span>₱{Number(shift.expected_cash).toFixed(2)}</span></div>
              </div>
            )}
            <p className="text-xs text-stone-500">Now count the actual cash in the drawer:</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">GCash Balance</label>
              <Input type="number" inputMode="decimal" value={shiftCloseGcash} onChange={e => setShiftCloseGcash(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
            </div>
            <DenominationCounter value={shiftCloseDenoms} onChange={(d, t) => { setShiftCloseDenoms(d); setShiftCloseTotal(t) }} />
            {shift && (() => {
              const diff = shiftCloseTotal - Number(shift.expected_cash)
              const balanced = Math.abs(diff) < 0.005
              const label = balanced ? " (balanced)" : diff > 0 ? " (over)" : " (short)"
              return (
                <div className={`rounded-lg p-2 text-center text-sm font-semibold ${balanced ? "bg-green-500/20 text-green-700" : "bg-red-500/20 text-red-600"}`}>
                  Variance: {diff >= 0 ? "+" : ""}₱{diff.toFixed(2)}{label}
                </div>
              )
            })()}
            <Input placeholder="Note (optional)" value={shiftCloseNote} onChange={e => setShiftCloseNote(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShiftCloseModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-primary hover:bg-amber-400" onClick={closeShift} disabled={shiftSaving}>
                {shiftSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Close Shift & Print"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ PENDING SYNC MODAL ══ */}
      <Dialog open={syncModal} onOpenChange={setSyncModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><WifiOffIcon className="h-5 w-5 text-amber-600" /> Pending Offline Items</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {offlineStore.getQueue().length === 0 && offlineStore.getClientShift()?.closingCash === undefined && (
              <p className="text-sm text-stone-500">Nothing pending — everything is synced.</p>
            )}
            {offlineStore.getClientShift()?.closingCash !== undefined && (
              <div className="rounded-lg border border-amber-300/40 bg-gold-100/60 px-3 py-2 text-xs text-stone-600">
                <strong>Shift close</strong> is waiting to sync (₱{Number(offlineStore.getClientShift()!.closingCash).toFixed(2)} counted).
              </div>
            )}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {offlineStore.getQueue().map(item => (
                <div key={item.clientRef} className="flex items-center justify-between rounded-lg border border-amber-300/40 bg-gold-100/60 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{item.ref ? `Receipt ${item.ref}` : `Sale ${item.clientRef.slice(0, 8)}`}</div>
                    <div className="text-xs text-stone-500">₱{Number(item.body.total || 0).toFixed(2)} · {new Date(item.createdAt).toLocaleString("en-PH")}</div>
                  </div>
                  <button onClick={() => discardQueued(item.clientRef)} className="rounded-full border border-red-400/40 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/20 transition-colors">Discard</button>
                </div>
              ))}
            </div>
            {offlineStore.getLastError() && (
              <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                <strong>Last error:</strong> {offlineStore.getLastError()!.message}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSyncModal(false)}>Close</Button>
              <Button className="flex-1 bg-primary hover:bg-amber-400" onClick={retrySync}>Retry Sync</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ COLLECTIONS MODAL ══ */}
      <Dialog open={collModal} onOpenChange={setCollModal}>
        <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle>Collections (Utang Payment)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!collSelected ? (
              <>
                <Input placeholder="Search customer..." value={collSearch} onChange={e => {
                  setCollSearch(e.target.value)
                  if (e.target.value.length < 1) { setCollResults([]); return }
                  fetch(`/api/backoffice/customers?q=${encodeURIComponent(e.target.value)}`).then(r => r.json()).then(d => setCollResults(d.customers ?? []))
                }} className="bg-gold-100 border-amber-300/60 h-10" />
                {collResults.map((c: any) => (
                  <button key={c.id} onClick={() => setCollSelected({ id: c.id, name: c.name, balance: c.balance ?? 0 })}
                    className="w-full text-left p-2 rounded bg-gold-100 text-sm hover:bg-white">
                    <div className="font-medium text-white">{c.name}</div>
                    <div className="text-xs text-amber-600">Utang: ₱{(c.balance ?? 0).toFixed(2)}</div>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="p-3 rounded bg-gold-100">
                  <p className="text-sm font-medium">{collSelected.name}</p>
                  <p className="text-xl font-bold text-amber-600">Balance: ₱{collSelected.balance.toFixed(2)}</p>
                </div>
                <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={collAmount}
                  onChange={e => setCollAmount(e.target.value)}
                  className="bg-gold-100 border-amber-300/60 h-12 text-lg font-mono flex-1"
                />
                  <Select value={collMethod} onValueChange={v => setCollMethod(v ?? "cash")}>
                    <SelectTrigger className="w-28 bg-gold-100 border-amber-300/60 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="gcash">GCash</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setCollSelected(null); setCollAmount(""); setCollModal(false) }}>Cancel</Button>
                  <Button className="flex-1 bg-primary hover:bg-amber-400"
                    onClick={async () => {
                      if (!collAmount || Number(collAmount) <= 0) { toast.error("Enter a valid amount"); return }
                      if (Number(collAmount) > collSelected.balance) { toast.error(`Amount exceeds balance (₱${collSelected.balance.toFixed(2)})`); return }
                      setCollSaving(true)
                      const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: collSelected.id, amount: Number(collAmount), method: collMethod }) })
                      const json = await res.json()
                      if (!res.ok) { toast.error(json.error || "Collection failed"); setCollSaving(false); return }
                      toast.success(`Collected ₱${Number(collAmount).toFixed(2)}. Balance: ₱${json.newBalance.toFixed(2)}`)
                      setCollSaving(false); setCollModal(false); setCollSelected(null); setCollAmount("")
                    }}
                    disabled={collSaving}>{collSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Record Payment"}</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
