"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, TruckIcon, SlidersHorizontal, Loader2Icon, HistoryIcon } from "lucide-react"
import { toast } from "sonner"

interface InvItem {
  id: string; name: string; category_id: string | null; sell_by: string; stock_qty: number;
  min_stock: number; cost: number; value: number; stock_status: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InvItem[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const [adjustItem, setAdjustItem] = useState<InvItem | null>(null)
  const [adjType, setAdjType] = useState("spoilage")
  const [adjQty, setAdjQty] = useState("")
  const [adjReason, setAdjReason] = useState("")
  const [adjSaving, setAdjSaving] = useState(false)

  const [deliverItem, setDeliverItem] = useState<InvItem | null>(null)
  const [delivQty, setDelivQty] = useState("")
  const [delivSupplier, setDelivSupplier] = useState("")
  const [delivSaving, setDelivSaving] = useState(false)

  const [movementsItem, setMovementsItem] = useState<InvItem | null>(null)
  const [movementsData, setMovementsData] = useState<any[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementFrom, setMovementFrom] = useState("")
  const [movementTo, setMovementTo] = useState("")

  const fetchData = useCallback(async () => {
    const [invRes, catRes] = await Promise.all([
      fetch("/api/backoffice/inventory"),
      fetch("/api/backoffice/categories"),
    ])
    const inv = await invRes.json()
    const cats = await catRes.json()
    setItems(inv.items ?? [])
    setCategories(cats.categories ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveAdjustment() {
    if (!adjustItem || !adjQty) { toast.error("Enter quantity"); return }
    setAdjSaving(true)
    const delta = adjType === "physical_count" ? Number(adjQty) - adjustItem.stock_qty : -Math.abs(Number(adjQty))
    const res = await fetch("/api/backoffice/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: adjustItem.id, adjustmentType: adjType, quantity: delta, reason: adjReason }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || "Failed"); setAdjSaving(false); return }
    toast.success(`Stock adjusted to ${json.newQty}`)
    setAdjustItem(null); setAdjQty(""); setAdjReason(""); setAdjSaving(false)
    fetchData()
  }

  async function openMovements(item: InvItem) {
    setMovementsItem(item)
    setMovementFrom("")
    setMovementTo("")
    setMovementsLoading(true)
    setMovementsData([])
    try {
      const res = await fetch(`/api/backoffice/items/${item.id}/movements`)
      const json = await res.json()
      setMovementsData(json.movements ?? [])
    } catch {
      toast.error("Failed to load movements")
    } finally {
      setMovementsLoading(false)
    }
  }

  async function fetchMovements(itemId: string, from: string, to: string) {
    setMovementsLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const qs = params.toString()
      const res = await fetch(`/api/backoffice/items/${itemId}/movements${qs ? "?" + qs : ""}`)
      const json = await res.json()
      setMovementsData(json.movements ?? [])
    } catch {
      toast.error("Failed to load movements")
    } finally {
      setMovementsLoading(false)
    }
  }

  async function saveDelivery() {
    if (!deliverItem || !delivQty || Number(delivQty) <= 0) { toast.error("Enter quantity"); return }
    setDelivSaving(true)
    const res = await fetch("/api/backoffice/deliveries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier: delivSupplier, items: [{ itemId: deliverItem.id, quantity: Number(delivQty) }] }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || "Failed"); setDelivSaving(false); return }
    toast.success(`Received ${delivQty}. New stock: ${json.received[0]?.newQty}`)
    setDeliverItem(null); setDelivQty(""); setDelivSupplier(""); setDelivSaving(false)
    fetchData()
  }

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
  const riceCatId = categories.find(c => c.name.toLowerCase() === "rice")?.id
  const showSplit = riceCatId
  const riceItems = showSplit ? filtered.filter(i => i.category_id === riceCatId) : []
  const otherItems = showSplit ? filtered.filter(i => i.category_id !== riceCatId) : filtered
  const totalValue = items.reduce((s, i) => s + i.value, 0)
  const lowCount = items.filter(i => i.stock_status !== "ok").length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-stone-500">Total value: ₱{totalValue.toFixed(2)} · {lowCount} low/out</p>
        </div>
      </div>

      <div className="relative max-w-sm md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
        <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-gold-100 border-amber-300/60 text-stone-800" />
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2Icon className="h-8 w-8 animate-spin text-green-700" /></div> : filtered.length === 0 ? (
        <Card className="bg-gold-200/90 border-amber-300/60"><CardContent className="p-6 text-center text-stone-500">No items found</CardContent></Card>
      ) : (
        <>
        {/* Mobile Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:hidden">
          {showSplit ? (
            <>
              {riceItems.length > 0 && (
                <><div className="text-xs font-bold text-amber-600 tracking-wider uppercase px-1">Rice</div>
                {riceItems.map(i => (
                  <div key={i.id} className="bg-gold-200 rounded-xl p-4 border border-amber-300/60 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-stone-800 text-sm">{i.name}</span>
                      <Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 space-y-0.5">
                      <div className="flex justify-between">
                        <span><span className="font-medium text-stone-700">On Hand:</span> {Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</span>
                        <span><span className="font-medium text-stone-700">Min:</span> {Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-stone-700">₱{i.value.toFixed(2)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}</>
              )}
              {otherItems.length > 0 && (
                <><div className="text-xs font-bold text-stone-500 tracking-wider uppercase px-1">Other Items</div>
                {otherItems.map(i => (
                  <div key={i.id} className="bg-gold-200 rounded-xl p-4 border border-amber-300/60 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-stone-800 text-sm">{i.name}</span>
                      <Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 space-y-0.5">
                      <div className="flex justify-between">
                        <span><span className="font-medium text-stone-700">On Hand:</span> {Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</span>
                        <span><span className="font-medium text-stone-700">Min:</span> {Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-stone-700">₱{i.value.toFixed(2)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}</>
              )}
            </>
          ) : (
            filtered.map(i => (
              <div key={i.id} className="bg-gold-200 rounded-xl p-4 border border-amber-300/60 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-stone-800 text-sm">{i.name}</span>
                  <Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge>
                </div>
                <div className="text-xs text-stone-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span><span className="font-medium text-stone-700">On Hand:</span> {Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</span>
                    <span><span className="font-medium text-stone-700">Min:</span> {Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-stone-700">₱{i.value.toFixed(2)}</span>
                    <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {/* Desktop Table */}
        <div className="hidden md:block">
        <Card className="bg-gold-200/90 border-amber-300/60">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-amber-300/60 hover:bg-transparent">
                  <TableHead className="text-stone-700">Product</TableHead>
                  <TableHead className="text-stone-700 text-right">On Hand</TableHead>
                  <TableHead className="text-stone-700 text-right">Min</TableHead>
                  <TableHead className="text-stone-700 text-right">Value</TableHead>
                  <TableHead className="text-stone-700">Status</TableHead>
                  <TableHead className="text-stone-700 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSplit ? (
                  <>
                    {riceItems.length > 0 && (
                      <>
                        <TableRow className="border-amber-300/60 hover:bg-transparent">
                          <TableCell colSpan={6} className="px-3 py-2 bg-primary/10">
                            <span className="text-xs font-bold text-amber-600 tracking-wider uppercase">Rice</span>
                          </TableCell>
                        </TableRow>
                        {riceItems.map(i => (
                          <TableRow key={i.id} className="border-amber-300/60">
                            <TableCell className="text-stone-800 font-medium">{i.name}</TableCell>
                            <TableCell className="text-right text-stone-700">{Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</TableCell>
                            <TableCell className="text-right text-stone-500">{Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</TableCell>
                            <TableCell className="text-right text-stone-500">₱{i.value.toFixed(2)}</TableCell>
                            <TableCell><Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge></TableCell>
                            <TableCell className="text-right"><div className="flex gap-1 justify-end"><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button></div></TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                    {otherItems.length > 0 && (
                      <>
                        <TableRow className="border-amber-300/60 hover:bg-transparent">
                          <TableCell colSpan={6} className="px-3 py-2 bg-white/20">
                            <span className="text-xs font-bold text-stone-500 tracking-wider uppercase">Other Items</span>
                          </TableCell>
                        </TableRow>
                        {otherItems.map(i => (
                          <TableRow key={i.id} className="border-amber-300/60">
                            <TableCell className="text-stone-800 font-medium">{i.name}</TableCell>
                            <TableCell className="text-right text-stone-700">{Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</TableCell>
                            <TableCell className="text-right text-stone-500">{Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</TableCell>
                            <TableCell className="text-right text-stone-500">₱{i.value.toFixed(2)}</TableCell>
                            <TableCell><Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge></TableCell>
                            <TableCell className="text-right"><div className="flex gap-1 justify-end"><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button></div></TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  filtered.map(i => (
                    <TableRow key={i.id} className="border-amber-300/60">
                      <TableCell className="text-stone-800 font-medium">{i.name}</TableCell>
                      <TableCell className="text-right text-stone-700">{Number(i.stock_qty).toFixed(i.sell_by === "weight" ? 3 : 0)} {i.sell_by === "weight" ? "kg" : "pc"}</TableCell>
                      <TableCell className="text-right text-stone-500">{Number(i.min_stock).toFixed(i.sell_by === "weight" ? 1 : 0)}</TableCell>
                      <TableCell className="text-right text-stone-500">₱{i.value.toFixed(2)}</TableCell>
                      <TableCell><Badge className={i.stock_status === "ok" ? "bg-green-600" : i.stock_status === "low" ? "bg-amber-100 text-amber-700" : "bg-red-500"}>{i.stock_status.toUpperCase()}</Badge></TableCell>
                      <TableCell className="text-right"><div className="flex gap-1 justify-end"><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setDeliverItem(i); setDelivQty(""); setDelivSupplier("") }}><TruckIcon className="h-3 w-3 mr-1" />Receive</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setAdjustItem(i); setAdjQty(""); setAdjReason(""); setAdjType("spoilage") }}><SlidersHorizontal className="h-3 w-3 mr-1" />Adjust</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openMovements(i)}><HistoryIcon className="h-3 w-3 mr-1" />Movements</Button></div></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
        </>
      )}

      {/* Delivery Modal */}
      <Dialog open={!!deliverItem} onOpenChange={() => setDeliverItem(null)}>
        <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle>Receive Delivery — {deliverItem?.name}</DialogTitle></DialogHeader>
          {deliverItem && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500">Current: {Number(deliverItem.stock_qty).toFixed(deliverItem.sell_by === "weight" ? 3 : 0)} {deliverItem.sell_by === "weight" ? "kg" : "pc"}</p>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">Supplier (optional)</label>
                <Input value={delivSupplier} onChange={e => setDelivSupplier(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
              </div>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">Quantity received ({deliverItem.sell_by === "weight" ? "kg" : "pcs"})</label>
                <Input type="number" step={deliverItem.sell_by === "weight" ? "0.1" : "1"} value={delivQty} onChange={e => setDelivQty(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
                <p className="text-xs text-stone-500">Delivery increases stock only (cost is set in Products).</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeliverItem(null)}>Cancel</Button>
                <Button onClick={saveDelivery} disabled={delivSaving} className="bg-primary hover:bg-amber-400">{delivSaving ? "..." : "Receive"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjustment Modal */}
      <Dialog open={!!adjustItem} onOpenChange={() => setAdjustItem(null)}>
        <DialogContent className="max-w-sm bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
          <DialogHeader><DialogTitle>Adjust Stock — {adjustItem?.name}</DialogTitle></DialogHeader>
          {adjustItem && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500">Current: {Number(adjustItem.stock_qty).toFixed(adjustItem.sell_by === "weight" ? 3 : 0)}</p>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">Type</label>
                <Select value={adjType} onValueChange={v => setAdjType(v ?? "spoilage")}>
                  <SelectTrigger className="bg-gold-100 border-amber-300/60 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spoilage">Spoilage</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="moisture_loss">Moisture Loss</SelectItem>
                    <SelectItem value="physical_count">Physical Count (set exact)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">{adjType === "physical_count" ? "Actual counted quantity" : "Quantity to remove"}</label>
                <Input type="number" step="0.001" value={adjQty} onChange={e => setAdjQty(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
              </div>
              <div className="space-y-1.5 mb-1">
                <label className="text-xs font-medium text-stone-500 mb-1">Reason</label>
                <Input value={adjReason} onChange={e => setAdjReason(e.target.value)} className="bg-gold-100 border-amber-300/60 h-10" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdjustItem(null)}>Cancel</Button>
                <Button onClick={saveAdjustment} disabled={adjSaving} className="bg-amber-100 text-amber-700 hover:bg-yellow-500">{adjSaving ? "..." : "Adjust"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Movements Dialog */}
      <Dialog open={!!movementsItem} onOpenChange={() => setMovementsItem(null)}>
        <DialogContent className="w-[min(96vw,60rem)] max-w-none bg-gold-200/90 border-amber-300/60 text-stone-800 p-5 max-h-[85vh] overflow-y-auto sm:max-w-none">
          <DialogHeader><DialogTitle>Movements — {movementsItem?.name}</DialogTitle></DialogHeader>
          {movementsItem && (
            <div className="space-y-4">
              {/* Date Range Filter */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-stone-500">From</label>
                <Input type="date" value={movementFrom} onChange={e => setMovementFrom(e.target.value)}
                  className="bg-gold-100 border-amber-300/60 h-8 w-40 text-xs" />
                <label className="text-xs font-medium text-stone-500">To</label>
                <Input type="date" value={movementTo} onChange={e => setMovementTo(e.target.value)}
                  className="bg-gold-100 border-amber-300/60 h-8 w-40 text-xs" />
                <Button variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => fetchMovements(movementsItem.id, movementFrom, movementTo)}>
                  Filter
                </Button>
                {(movementFrom || movementTo) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-stone-500"
                    onClick={() => { setMovementFrom(""); setMovementTo(""); fetchMovements(movementsItem.id, "", "") }}>
                    Clear
                  </Button>
                )}
              </div>

              {movementsLoading ? (
                <div className="flex justify-center py-8"><Loader2Icon className="h-6 w-6 animate-spin text-green-700" /></div>
              ) : movementsData.length === 0 ? (
                <p className="text-center text-stone-500 py-8">No movements recorded</p>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-2 md:hidden">
                    {movementsData.map((m: any) => (
                      <div key={m.id} className="bg-gold-100 rounded-xl p-3 border border-amber-300/60 text-xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-stone-700">{new Date(m.created_at).toLocaleString("en-PH")}</span>
                          <span className="capitalize text-stone-500">{m.reason}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[10px] text-stone-400">Qty In</div>
                            <div className="font-bold text-green-600">{m.qty_in > 0 ? Number(m.qty_in).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-stone-400">Qty Out</div>
                            <div className="font-bold text-red-500">{m.qty_out > 0 ? Number(m.qty_out).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-stone-400">On Hand</div>
                            <div className="font-bold text-stone-700">{Number(m.qty_after).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0)}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div>
                            <div className="text-[10px] text-stone-400">Cost</div>
                            <div className="text-stone-600">₱{m.cost ? Number(m.cost).toFixed(2) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-stone-400">Sold Price</div>
                            <div className="text-stone-600">{m.sold_price ? "₱" + Number(m.sold_price).toFixed(2) : "—"}</div>
                          </div>
                        </div>
                        {m.note ? <div className="text-stone-400 text-center">{m.note}</div> : null}
                        <div className="flex justify-between text-stone-400 pt-0.5">
                          <span>Before {Number(m.qty_before).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0)}</span>
                          {m.employee_name ? <span>{m.employee_name}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden md:block rounded-xl border border-amber-300/60 overflow-x-hidden">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow className="border-amber-300/60 hover:bg-transparent">
                          <TableHead className="text-[10px] text-stone-500 font-semibold">Date</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold">Type</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold text-right">Qty In</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold text-right">Qty Out</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold text-right">On Hand</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold text-right">Cost</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold text-right">Sold Price</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold">Ref</TableHead>
                          <TableHead className="text-[10px] text-stone-500 font-semibold">Employee</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movementsData.map((m: any) => (
                          <TableRow key={m.id} className="border-amber-300/60">
                            <TableCell className="text-xs text-stone-700 whitespace-normal">{new Date(m.created_at).toLocaleString("en-PH")}</TableCell>
                            <TableCell className="text-xs capitalize text-stone-500">{m.reason}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-green-600">{m.qty_in > 0 ? Number(m.qty_in).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0) : "—"}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-red-500">{m.qty_out > 0 ? Number(m.qty_out).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0) : "—"}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-stone-700">{Number(m.qty_after).toFixed(movementsItem?.sell_by === "weight" ? 3 : 0)}</TableCell>
                            <TableCell className="text-xs text-right text-stone-500">{m.cost ? "₱" + Number(m.cost).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-xs text-right text-stone-500">{m.sold_price ? "₱" + Number(m.sold_price).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-xs text-stone-400 whitespace-normal break-words">{m.note ?? "—"}</TableCell>
                            <TableCell className="text-xs text-stone-400">{m.employee_name ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
