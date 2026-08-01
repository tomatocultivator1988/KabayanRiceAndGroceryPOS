"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, ChevronLeft, ChevronRight, X, LogOutIcon, LayoutDashboardIcon, StoreIcon, PackageIcon, BoxesIcon, UsersIcon, TrendingUpIcon, Loader2Icon, RotateCcwIcon, PrinterIcon, Trash2Icon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Sale = {
  id: string
  saleNumber: number | null
  employeeName: string
  paymentMethod: string
  total: number
  status: string
  createdAt: string | null
}

type SalesResponse = {
  sales: Sale[]
  total: number
  page: number
  pages: number
}

type Employee = {
  id: string
  name: string
}

function formatTime(iso: string | null): string {
  if (!iso) return "N/A"
  const d = new Date(iso)
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A"
  const d = new Date(iso)
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
}

function paymentMethodBadge(method: string) {
  const map: Record<string, { label: string; className: string }> = {
    cash: { label: "Cash", className: "bg-amber-500/20 text-amber-700 border-amber-500/40" },
    card: { label: "Card", className: "bg-blue-500/20 text-blue-700 border-blue-500/40" },
    gcash: { label: "GCash", className: "bg-purple-500/20 text-purple-700 border-purple-500/40" },
    split: { label: "Split", className: "bg-blue-500/20 text-blue-700 border-blue-500/40" },
  }
  const cfg = map[method.toLowerCase()] ?? { label: method, className: "bg-white/50 text-stone-700 border-stone-600/40" }
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Completed", className: "bg-green-500/20 text-green-700 border-green-500/40" },
    paid: { label: "Paid", className: "bg-green-500/20 text-green-700 border-green-500/40" },
    partial: { label: "Partial", className: "bg-yellow-500/20 text-yellow-700 border-yellow-500/40" },
    unpaid: { label: "Unpaid", className: "bg-red-500/20 text-red-600 border-red-500/40" },
    refunded: { label: "Refunded", className: "bg-red-500/20 text-red-600 border-red-500/40" },
    voided: { label: "Voided", className: "bg-white/20 text-stone-700 border-stone-500/40" },
  }
  const cfg = map[status.toLowerCase()] ?? { label: status, className: "bg-white/50 text-stone-700 border-stone-600/40" }
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export default function SalesPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [data, setData] = useState<SalesResponse | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [actionOpen, setActionOpen] = useState(false)
  const [actionSale, setActionSale] = useState<Sale | null>(null)
  const [actionType, setActionType] = useState<"refund" | "void" | "reprint" | "">("")
  const [actionReason, setActionReason] = useState("")
  const [actionLoading, setActionLoading] = useState(false)
  const [storeName, setStoreName] = useState("")

  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    fetch("/api/pos/me").then(r => r.json()).then(d => {
      if (d.employee) setUser({ name: d.employee.name, role: d.employee.role })
      else { router.push("/auth/login") }
    }).catch(() => { router.push("/auth/login") })
  }, [router])

  useEffect(() => {
    fetch("/api/backoffice/store").then(r => r.json()).then(d => {
      if (d.store?.name) setStoreName(d.store.name)
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/auth/login")
  }

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", "20")
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (employeeId && employeeId !== "all") params.set("employeeId", employeeId)
      if (search) params.set("search", search)

      const res = await fetch(`/api/dashboard/sales?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch sales")
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message ?? "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [page, from, to, employeeId, search])

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/backoffice/employees")
      if (res.ok) {
        const json = await res.json()
        setEmployees(json.employees ?? [])
      }
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const handleAction = async () => {
    if (!actionSale) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sales/${actionSale.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionType, reason: actionReason || `${actionType} requested` }),
        })
        if (!res.ok) throw new Error()
        toast.success(`${actionType === "void" ? "Sale voided" : "Sale refunded"}`)
        setActionOpen(false)
        fetchSales()
    } catch { toast.error("Action failed") }
    finally { setActionLoading(false) }
  }

  const openAction = (sale: Sale, type: "refund" | "void" | "reprint") => {
    setActionSale(sale)
    setActionType(type)
    setActionReason("")
    if (type === "reprint") {
      // Reprint immediately
      setActionSale(sale)
      setActionType("reprint")
      handleReprint(sale)
      return
    }
    setActionOpen(true)
  }

  const handleReprint = async (sale: Sale) => {
    try {
      const rr = await fetch(`/api/receipts/${sale.id}`)
      const json = await rr.json()
      if (json.sale) {
        const s = json.sale
        const { openBrowserReceipt } = await import("@/lib/utils/printer")
        openBrowserReceipt({
          header: storeName || "GroceryPOS", subtitle: "Receipt",
          items: s.items.map((i: any) => ({ name: i.itemName, qty: i.qty, price: i.lineTotal })),
          subtotal: s.subtotal, discount: s.discountAmt || 0, tax: s.taxTotal || 0, total: s.total,
          paymentMethod: s.payments.map((p: any) => `${p.method} ₱${p.amount}`).join(" + "),
          amountTendered: s.payments.reduce((sum: number, p: any) => sum + p.amount, 0),
          change: 0,
          orderNumber: String(s.saleNumber).padStart(6, "0"),
          date: new Date(s.createdAt).toLocaleString("en-PH"),
          cashier: s.employeeName,
          footer: "Salamat po! Come again!",
        })
        toast.success("Receipt printing...")
      }
    } catch { toast.error("Reprint failed") }
  }

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const today = new Date().toISOString().slice(0, 10)
  const hasFilters = from || to || (employeeId && employeeId !== "all") || search

  const navLinks = [
    { label: "POS", href: "/pos", icon: StoreIcon },
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
        { label: "Sales", href: "/dashboard/sales", icon: TrendingUpIcon },
{ label: "Items", href: "/backoffice/items", icon: PackageIcon },
    { label: "Inventory", href: "/backoffice/inventory", icon: BoxesIcon },
    { label: "Employees", href: "/backoffice/employees", icon: UsersIcon },
  ]

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-transparent"><Loader2Icon className="h-8 w-8 animate-spin text-amber-600" /></div>
  )

  return (
    <div className="flex h-screen flex-col bg-transparent">


      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-amber-600">Sales History</h1>

          <Card className="rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl shadow-md">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-stone-500">From</label>
                  <Input
                    type="date"
                    value={from}
                    max={to || today}
                    onChange={(e) => {
                      setFrom(e.target.value)
                      setPage(1)
                    }}
                    className="rounded-xl border-amber-600/40 bg-gold-200/90 backdrop-blur-xl"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-stone-500">To</label>
                  <Input
                    type="date"
                    value={to}
                    min={from}
                    max={today}
                    onChange={(e) => {
                      setTo(e.target.value)
                      setPage(1)
                    }}
                    className="rounded-xl border-amber-600/40 bg-gold-200/90 backdrop-blur-xl"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-stone-500">Cashier</label>
                  <Select
                    value={employeeId || "all"}
                    onValueChange={(v) => {
                      if (!v || v === "all") { setEmployeeId("all"); setPage(1); return }
                      setEmployeeId(v)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="w-40 rounded-xl border-amber-600/40 bg-gold-200/90 backdrop-blur-xl">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <form onSubmit={handleSearchSubmit} className="grid gap-1.5">
                  <label className="text-xs font-medium text-stone-500">Search</label>
                  <div className="relative">
                    <Input
                      placeholder="Sale # or item..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-52 rounded-xl border-amber-600/40 bg-gold-200/90 backdrop-blur-xl pr-8"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-0 top-0 text-stone-500 hover:text-amber-500"
                    >
                      <Search className="size-3.5" />
                    </Button>
                  </div>
                </form>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-stone-500 hover:text-amber-500"
                    onClick={() => {
                      setFrom("")
                      setTo("")
                      setEmployeeId("")
                      setSearch("")
                      setSearchInput("")
                      setPage(1)
                    }}
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card className="rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl shadow-md">
              <CardContent className="py-12 text-center">
                <p className="text-stone-500">{error}</p>
                <button
                  onClick={fetchSales}
                  className="mt-3 text-sm font-medium text-amber-600 underline underline-offset-4 hover:text-amber-500"
                >
                  Retry
                </button>
              </CardContent>
            </Card>
          )}

          {!error && (
            <>
              {/* Mobile Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:hidden">
                {loading ? (
                  <div className="rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl p-8 text-center text-stone-500 shadow-md">Loading...</div>
                ) : !data || data.sales.length === 0 ? (
                  <div className="rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl p-8 text-center text-stone-500 shadow-md">No sales found</div>
                ) : (
                  data.sales.map((sale) => (
                    <div key={sale.id} className="rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl p-4 shadow-md">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-amber-600 text-sm">#{(sale.saleNumber ? String(sale.saleNumber).padStart(6,'0') : '-')} Â· {sale.employeeName}</span>
                        <span className="text-amber-600 font-extrabold">{sale.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          {paymentMethodBadge(sale.paymentMethod)}
                          {statusBadge(sale.status)}
                        </div>
                        <span className="text-stone-500">{formatDate(sale.createdAt)} {formatTime(sale.createdAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <Card className="hidden md:block overflow-hidden rounded-2xl border-2 border-amber-300/60 bg-gold-200/90 backdrop-blur-xl shadow-md">
                <CardContent className="p-0">
                  <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-transparent">
                      <TableHead className="w-16 pl-6 text-xs font-semibold uppercase text-amber-700">#</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-amber-700">Cashier</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-amber-700">Method</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-amber-700">Total</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-amber-700">Status</TableHead>
                      <TableHead className="pr-6 text-right text-xs font-semibold uppercase text-amber-700">Time</TableHead>
                      <TableHead className="pr-2 text-xs font-semibold uppercase text-amber-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-16 text-center text-stone-500">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !data || data.sales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-16 text-center text-stone-500">
                          No sales found
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.sales.map((sale) => (
                        <TableRow key={sale.id} className="hover:bg-transparent/50">
                          <TableCell className="pl-6">
                            <span className="text-xs text-stone-600">
                              {(sale.saleNumber ? String(sale.saleNumber).padStart(6,'0') : '-')}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium text-green-900">{sale.employeeName}</TableCell>
                          <TableCell>{paymentMethodBadge(sale.paymentMethod)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-amber-600">
                            P{sale.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>{statusBadge(sale.status)}</TableCell>
                          <TableCell className="pr-2 text-right text-xs text-stone-600">
                            {formatDate(sale.createdAt)} {formatTime(sale.createdAt)}
                          </TableCell>
                          <TableCell className="pr-2">
                            <div className="flex gap-1 justify-end">
                              {sale.status === "completed" && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openAction(sale, "void")} className="h-7 rounded-lg text-xs text-red-500 hover:bg-red-50 hover:text-red-700"><Trash2Icon className="h-3 w-3 mr-1"/>Void</Button>
                                  <Button variant="ghost" size="sm" onClick={() => openAction(sale, "refund")} className="h-7 rounded-lg text-xs text-amber-600 hover:text-amber-700"><RotateCcwIcon className="h-3 w-3 mr-1"/>Refund</Button>
                                </>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => openAction(sale, "reprint")} className="h-7 rounded-lg text-xs text-blue-500 hover:bg-blue-50 hover:text-blue-700"><PrinterIcon className="h-3 w-3 mr-1"/>Print</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </>
          )}

          {data && data.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-500">
                Page {data.page} of {data.pages} ({data.total} sales)
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-2 border-amber-600/40 text-amber-600 font-medium hover:bg-stone-100"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-2 border-amber-600/40 text-amber-600 font-medium hover:bg-stone-100"
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Action Dialog */}
        <Dialog open={actionOpen} onOpenChange={setActionOpen}>
          <DialogContent className="sm:max-w-sm rounded-2xl bg-gold-200/90 border-amber-300/60 text-stone-800 p-5">
            <DialogHeader>
              <DialogTitle className="text-amber-600">
                {actionType === "refund" ? "Refund Sale" : actionType === "void" ? "Void Sale" : "Reprint"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-amber-600">
                {actionType === "reprint"
                  ? "Open receipt for printing?"
                  : `This will ${actionType} sale #${actionSale ? (actionSale.saleNumber ? String(actionSale.saleNumber).padStart(6,'0') : '-') : '-'} (P${actionSale?.total.toLocaleString("en-PH", {minimumFractionDigits:2})}). This action cannot be undone.`}
              </p>
              {actionType !== "reprint" && (
                <div>
                  <label className="text-xs font-medium text-stone-500 mb-1">Reason</label>
                  <Input value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Required"
                    className="h-10 rounded-xl bg-gold-100 border-amber-600/40 mt-1" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionOpen(false)}>Cancel</Button>
              <Button onClick={handleAction} disabled={actionLoading || (actionType !== "reprint" && !actionReason.trim())}
                className={actionType === "void" ? "bg-red-500 hover:bg-red-700 text-white" : actionType === "refund" ? "bg-primary hover:bg-amber-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}>
                {actionLoading ? "Processing..." : actionType === "refund" ? "Refund" : actionType === "void" ? "Void" : "Print"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
