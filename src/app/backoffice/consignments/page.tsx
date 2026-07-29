"use client"

import { useState, useEffect } from "react"
import { Loader2Icon, HandshakeIcon, ArrowDownToLineIcon, CheckCircle2Icon, HistoryIcon, Undo2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface ConsignmentItem {
  id: string
  name: string
  stockQty: number
  supplierId: string | null
  supplierName: string | null
  agreedPrice: number
  lastSettledAt: string | null
  soldThisPeriod: number
  totalCOGSThisPeriod: number
}

interface Settlement {
  id: string
  item_id: string
  qty_sold: number
  unit_price: number
  total_amount: number
  settled_at: string
  note: string | null
}

export default function ConsignmentsPage() {
  const [items, setItems] = useState<ConsignmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [settleItem, setSettleItem] = useState<ConsignmentItem | null>(null)
  const [settleNote, setSettleNote] = useState("")
  const [settling, setSettling] = useState(false)
  const [historyItem, setHistoryItem] = useState<ConsignmentItem | null>(null)
  const [history, setHistory] = useState<Settlement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [receiveItem, setReceiveItem] = useState<ConsignmentItem | null>(null)
  const [receiveQty, setReceiveQty] = useState("")
  const [receiving, setReceiving] = useState(false)
  const [pullOutItem, setPullOutItem] = useState<ConsignmentItem | null>(null)
  const [pullOutQty, setPullOutQty] = useState("")
  const [pullOutReason, setPullOutReason] = useState("")
  const [pullingOut, setPullingOut] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const res = await fetch("/api/backoffice/consignments")
      const d = await res.json()
      setItems(d.items ?? [])
    } catch { toast.error("Failed to load consignments") }
    setLoading(false)
  }

  async function handleSettle() {
    if (!settleItem || settleItem.soldThisPeriod <= 0) return
    setSettling(true)
    try {
      const res = await fetch("/api/backoffice/consignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: settleItem.id, note: settleNote || null }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || "Settlement failed"); setSettling(false); return }
      toast.success(`Settled: ${settleItem.name} — ${Number(settleItem.soldThisPeriod).toFixed(0)} units, ₱${d.settlement?.totalAmount?.toFixed(2) ?? "0.00"}`)
      setSettleItem(null); setSettleNote(""); await loadItems()
    } catch { toast.error("Settlement failed") }
    setSettling(false)
  }

  async function openHistory(item: ConsignmentItem) {
    setHistoryItem(item); setHistoryLoading(true)
    try {
      const res = await fetch(`/api/backoffice/consignments?type=history&itemId=${item.id}`)
      const d = await res.json()
      setHistory(d.settlements ?? [])
    } catch { toast.error("Failed to load history") }
    setHistoryLoading(false)
  }

  async function handleReceiveStock() {
    if (!receiveItem || !receiveQty || Number(receiveQty) <= 0) return
    setReceiving(true)
    try {
      const res = await fetch("/api/backoffice/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: receiveItem.id,
          adjustmentType: "stock-in",
          quantity: Number(receiveQty),
          reason: "Consignment stock-in",
        }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || "Failed to receive stock"); setReceiving(false); return }
      toast.success(`Received ${Number(receiveQty).toFixed(0)} units of ${receiveItem.name}`)
      setReceiveItem(null); setReceiveQty(""); await loadItems()
    } catch { toast.error("Failed") }
    setReceiving(false)
  }

  async function handlePullOut() {
    if (!pullOutItem || !pullOutQty || Number(pullOutQty) <= 0) return
    const qty = Number(pullOutQty)
    if (qty > pullOutItem.stockQty) { toast.error(`Only ${Number(pullOutItem.stockQty).toFixed(0)} units available to pull out`); return }
    setPullingOut(true)
    try {
      const res = await fetch("/api/backoffice/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: pullOutItem.id,
          adjustmentType: "return_to_supplier",
          quantity: -qty,
          reason: pullOutReason || "Consignment pull out",
        }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || "Failed to pull out stock"); setPullingOut(false); return }
      toast.success(`Pulled out ${qty.toFixed(0)} units of ${pullOutItem.name}`)
      setPullOutItem(null); setPullOutQty(""); setPullOutReason(""); await loadItems()
    } catch { toast.error("Failed") }
    setPullingOut(false)
  }

  function fmoney(v: number | string | null | undefined) { return `₱${Number(v ?? 0).toFixed(2)}` }

  if (loading) return <div className="flex justify-center py-16"><Loader2Icon className="h-8 w-8 animate-spin text-amber-600" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Consignments</h1>
        <p className="text-sm text-stone-500 mt-0.5">Track consignment items and supplier settlements</p>
      </div>

      {items.length === 0 ? (
        <Card className="bg-gold-200/90 border-amber-300/60">
          <CardContent className="p-8 text-center">
            <HandshakeIcon className="h-10 w-10 text-stone-400 mx-auto mb-3" />
            <p className="text-stone-700 font-medium">No consignment items</p>
            <p className="text-xs text-stone-500 mt-1">Mark an item as &quot;Consignment&quot; in Items to start tracking</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <Card key={item.id} className="bg-gold-200/90 border-amber-300/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-stone-800 truncate">{item.name}</h3>
                      <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/40 text-[10px]">CONSIGNMENT</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-600">
                      <span>Supplier: <strong>{item.supplierName || "—"}</strong></span>
                      <span>Agreed Price: <strong>{fmoney(item.agreedPrice)}</strong></span>
                      <span>On Hand: <strong>{Number(item.stockQty).toFixed(0)}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
                      <span className="text-green-700 font-semibold">Sold This Period: {Number(item.soldThisPeriod).toFixed(0)}</span>
                      <span className="text-red-600 font-semibold">To Pay: {fmoney(item.totalCOGSThisPeriod)}</span>
                      {item.lastSettledAt && <span className="text-stone-400">Last Settled: {new Date(item.lastSettledAt).toLocaleDateString("en-PH")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setReceiveItem(item); setReceiveQty("") }}><ArrowDownToLineIcon className="h-3.5 w-3.5 mr-1" /> Receive</Button>
                    <Button variant="outline" size="sm" onClick={() => { setPullOutItem(item); setPullOutQty(""); setPullOutReason("") }} disabled={item.stockQty <= 0}><Undo2Icon className="h-3.5 w-3.5 mr-1" /> Pull Out</Button>
                    <Button variant="outline" size="sm" onClick={() => openHistory(item)}><HistoryIcon className="h-3.5 w-3.5 mr-1" /> History</Button>
                    <Button size="sm" disabled={item.soldThisPeriod <= 0} onClick={() => { setSettleItem(item); setSettleNote("") }} className="bg-green-700 hover:bg-green-800 text-white"><CheckCircle2Icon className="h-3.5 w-3.5 mr-1" /> Settle</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Settle Dialog */}
      <Dialog open={!!settleItem} onOpenChange={() => { setSettleItem(null); setSettleNote("") }}>
        <DialogContent className="bg-gold-100 border-amber-300/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-800">Settle Consignment</DialogTitle>
            <DialogDescription className="text-stone-600">
              Confirm payment to {settleItem?.supplierName || "supplier"} for {settleItem?.name}
            </DialogDescription>
          </DialogHeader>
          {settleItem && (
            <div className="space-y-3">
              <div className="bg-gold-200/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Units Sold</span><strong>{Number(settleItem.soldThisPeriod).toFixed(0)}</strong></div>
                <div className="flex justify-between"><span>Avg Cost / Unit</span><strong>{fmoney(settleItem.totalCOGSThisPeriod / Math.max(settleItem.soldThisPeriod, 1))}</strong></div>
                <div className="flex justify-between text-base font-bold text-red-600 border-t border-amber-300/60 pt-1 mt-1"><span>To Pay</span><span>{fmoney(settleItem.totalCOGSThisPeriod)}</span></div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Note (optional)</Label>
                <Input value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="e.g., Paid via GCash" className="bg-gold-200 border-amber-300/60 text-stone-800" />
              </div>
              <Button onClick={handleSettle} disabled={settling || settleItem.soldThisPeriod <= 0} className="w-full bg-green-700 hover:bg-green-800 text-white">
                {settling ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm Settlement — {fmoney(settleItem.totalCOGSThisPeriod)}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historyItem} onOpenChange={() => { setHistoryItem(null); setHistory([]) }}>
        <DialogContent className="bg-gold-100 border-amber-300/60 max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-stone-800">Settlement History — {historyItem?.name}</DialogTitle>
            <DialogDescription className="text-stone-600">Previous settlements with {historyItem?.supplierName || "supplier"}</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2Icon className="h-6 w-6 animate-spin text-amber-600" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-stone-500 py-8">No previous settlements</p>
          ) : (
            <div className="space-y-2">
              {history.map(s => (
                <div key={s.id} className="bg-gold-200/50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-stone-500">Date</span><span>{new Date(s.settled_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Qty Sold</span><span>{s.qty_sold}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Avg Unit Price</span><span>{fmoney(s.unit_price)}</span></div>
                  <div className="flex justify-between font-semibold text-red-600"><span>Total Paid</span><span>{fmoney(s.total_amount)}</span></div>
                  {s.note && <div className="flex justify-between"><span className="text-stone-500">Note</span><span className="text-stone-600">{s.note}</span></div>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Stock Dialog */}
      <Dialog open={!!receiveItem} onOpenChange={() => { setReceiveItem(null); setReceiveQty("") }}>
        <DialogContent className="bg-gold-100 border-amber-300/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-800">Receive Consignment Stock</DialogTitle>
            <DialogDescription className="text-stone-600">{receiveItem?.name} from {receiveItem?.supplierName || "supplier"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-stone-500">Quantity to Add</Label>
              <Input type="number" min="1" value={receiveQty} onChange={e => setReceiveQty(e.target.value)} placeholder="e.g., 50" className="bg-gold-200 border-amber-300/60 text-stone-800" />
            </div>
            <Button onClick={handleReceiveStock} disabled={receiving || !receiveQty || Number(receiveQty) <= 0} className="w-full">
              {receiving ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownToLineIcon className="h-4 w-4 mr-2" />}
              Add {receiveQty || 0} Units to Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pull Out Dialog */}
      <Dialog open={!!pullOutItem} onOpenChange={() => { setPullOutItem(null); setPullOutQty(""); setPullOutReason("") }}>
        <DialogContent className="bg-gold-100 border-amber-300/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-800">Pull Out Consignment Stock</DialogTitle>
            <DialogDescription className="text-stone-600">{pullOutItem?.name} — return unsold stock to {pullOutItem?.supplierName || "supplier"}</DialogDescription>
          </DialogHeader>
          {pullOutItem && (
            <div className="space-y-3">
              <p className="text-xs text-stone-500">Current on hand: <strong>{Number(pullOutItem.stockQty).toFixed(0)}</strong></p>
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Quantity to Pull Out</Label>
                <Input type="number" min="1" max={pullOutItem.stockQty} value={pullOutQty} onChange={e => setPullOutQty(e.target.value)} placeholder="e.g., 10" className="bg-gold-200 border-amber-300/60 text-stone-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Reason (optional)</Label>
                <Input value={pullOutReason} onChange={e => setPullOutReason(e.target.value)} placeholder="e.g., Expired, slow-moving" className="bg-gold-200 border-amber-300/60 text-stone-800" />
              </div>
              <Button onClick={handlePullOut} disabled={pullingOut || !pullOutQty || Number(pullOutQty) <= 0} className="w-full bg-stone-700 hover:bg-stone-800 text-white">
                {pullingOut ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <Undo2Icon className="h-4 w-4 mr-2" />}
                Pull Out {pullOutQty || 0} Units
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
