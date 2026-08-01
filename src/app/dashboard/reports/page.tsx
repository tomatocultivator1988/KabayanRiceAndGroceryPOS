"use client"

import { useState, useEffect } from "react"
import { Loader2Icon, DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts"

interface ReportRow { [key: string]: any }

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="border-amber-300/60 bg-gold-200/90 min-w-[110px] flex-1">
      <CardContent className="p-3">
        <p className="text-[10px] text-stone-500 uppercase tracking-wider">{label}</p>
        <p className={`text-base font-bold ${color ?? "text-stone-800"}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("daily")
  const [from, setFrom] = useState(new Date().toISOString().split("T")[0])
  const [to, setTo] = useState(new Date().toISOString().split("T")[0])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("sales")

  useEffect(() => {
    const now = new Date()
    if (period === "daily") { setFrom(now.toISOString().split("T")[0]); setTo(now.toISOString().split("T")[0]) }
    else if (period === "monthly") { setFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setTo(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,"0")}`) }
    else if (period === "yearly") { setFrom(`${now.getFullYear()}-01-01`); setTo(`${now.getFullYear()}-12-31`) }
  }, [period])

  useEffect(() => {
    if (!from || !to) return
    setLoading(true)
    fetch(`/api/reports?type=${activeTab}&from=${from}&to=${to}`).then(r => r.json()).then(d => {
      setData(d); setLoading(false)
      if (d.error) console.error("Report error:", d.error)
    }).catch(e => { console.error("Fetch error:", e); setLoading(false) })
  }, [from, to, activeTab])

  function fmoney(v: any) { return `₱${Number(v ?? 0).toFixed(2)}` }
  function fnum(v: any, dec?: number) { return Number(v ?? 0).toFixed(dec ?? 0) }
  function fdate(v: any) { try { return new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) } catch { return String(v ?? "") } }

  function exportCSV(rows: any[], headers: string[]) {
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${activeTab}_${from}_${to}.csv`; a.click()
  }

  function renderTable(rows: ReportRow[], columns: { key: string; label: string; format: "money" | "number" | "date" | "text" | "percent" }[]) {
    return (
      <>
        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(rows, columns.map(c => c.key))} className="text-xs gap-1"><DownloadIcon className="h-3 w-3" /> CSV</Button>
        </div>
        <Card className="bg-gold-200/90 border-amber-300/60 overflow-x-auto">
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-amber-300/60">{columns.map(c => <th key={c.key} className="text-left px-3 py-2 text-stone-500 font-medium">{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={columns.length} className="text-center text-stone-500 py-8">No data</td></tr> :
                  rows.map((r, i) => <tr key={i} className="border-b border-amber-300/60 hover:bg-gold-200/50">
                    {columns.map(c => {
                      const v = r[c.key]
                      let display = ""
                      if (c.format === "money") display = fmoney(v)
                      else if (c.format === "number") display = fnum(v)
                      else if (c.format === "date") display = fdate(v)
                      else if (c.format === "percent") display = fnum(v, 1) + "%"
                      else display = String(v ?? "—")
                      return <td key={c.key} className={`px-3 py-1.5 text-stone-700 ${c.format !== "text" ? "text-right tabular-nums" : ""}`}>{display}</td>
                    })}
                  </tr>)}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </>
    )
  }

  const tabs = [
    { key: "sales", label: "Sales" },
    { key: "profit", label: "Profit" },
    { key: "products", label: "By Product" },
    { key: "receivables", label: "Receivables" },
    { key: "inventory", label: "Inventory" },
    { key: "voids", label: "Voids" },
    { key: "zreading", label: "Z-Reading" },
    { key: "salesdetail", label: "Sales Detail" },
    { key: "cashflow", label: "Cash Flow" },
    { key: "consignments", label: "Consignments" },
  ]

  function renderSummaryCards(cards: { label: string; value: string; color?: string }[]) {
    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {cards.map(c => <SummaryCard key={c.label} {...c} />)}
      </div>
    )
  }

  const GOLD = "#D4AF37"
  const BLUE = "#2563eb"
  const PURPLE = "#9333ea"
  const GREEN = "#0D3B1E"
  const RED = "#dc2626"
  const ORANGE = "#ea580c"

  function SalesContent() {
    const rows = data?.rows ?? []
    const totalCount = rows.reduce((s: number, r: any) => s + Number(r.count), 0)
    const totalRevenue = rows.reduce((s: number, r: any) => s + Number(r.total), 0)
    const totalCash = rows.reduce((s: number, r: any) => s + Number(r.cash), 0)
    const totalGcash = rows.reduce((s: number, r: any) => s + Number(r.gcash), 0)
    return (
      <>
        {renderSummaryCards([
          { label: "Total Sales", value: fmoney(totalRevenue), color: "text-amber-600" },
          { label: "Transactions", value: fnum(totalCount) },
          { label: "Cash", value: fmoney(totalCash), color: "text-blue-700" },
          { label: "GCash", value: fmoney(totalGcash), color: "text-purple-700" },
        ])}
        {rows.length > 1 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Sales Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => fdate(v)} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [fmoney(v), undefined]} labelFormatter={l => fdate(l)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" stroke={GOLD} strokeWidth={2} name="Total" dot={{ fill: GOLD, r: 2 }} />
                  <Line type="monotone" dataKey="cash" stroke={BLUE} strokeWidth={1.5} name="Cash" dot={false} />
                  <Line type="monotone" dataKey="gcash" stroke={PURPLE} strokeWidth={1.5} name="GCash" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "date", label: "Date", format: "date" },
          { key: "count", label: "# Sales", format: "number" },
          { key: "cash", label: "Cash", format: "money" },
          { key: "gcash", label: "GCash", format: "money" },
          { key: "total", label: "Total", format: "money" },
        ])}
      </>
    )
  }

  function ProfitContent() {
    const rows = data?.rows ?? []
    const totalRevenue = rows.reduce((s: number, r: any) => s + Number(r.revenue), 0)
    const totalCogs = rows.reduce((s: number, r: any) => s + Number(r.cogs), 0)
    const totalExpenses = rows.reduce((s: number, r: any) => s + Number(r.expenses), 0)
    const totalProfit = rows.reduce((s: number, r: any) => s + Number(r.profit), 0)
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
    return (
      <>
        {renderSummaryCards([
          { label: "Revenue", value: fmoney(totalRevenue), color: "text-amber-600" },
          { label: "COGS", value: fmoney(totalCogs), color: "text-red-600" },
          { label: "Expenses", value: fmoney(totalExpenses), color: "text-orange-600" },
          { label: "Net Profit", value: fmoney(totalProfit), color: totalProfit >= 0 ? "text-green-700" : "text-red-600" },
          { label: "Margin", value: fnum(avgMargin, 1) + "%", color: avgMargin >= 0 ? "text-green-700" : "text-red-600" },
        ])}
        {rows.length > 1 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Revenue vs Profit</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => fdate(v)} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [fmoney(v), undefined]} labelFormatter={l => fdate(l)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" fill={GOLD} name="Revenue" radius={[2,2,0,0]} />
                  <Bar dataKey="profit" fill={GREEN} name="Profit" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "date", label: "Date", format: "date" },
          { key: "revenue", label: "Revenue", format: "money" },
          { key: "cogs", label: "Cost", format: "money" },
          { key: "expenses", label: "Expenses", format: "money" },
          { key: "profit", label: "Profit", format: "money" },
          { key: "margin", label: "Margin", format: "percent" },
        ])}
      </>
    )
  }

  function ProductsContent() {
    const rows = data?.rows ?? []
    const top10 = [...rows].sort((a: any, b: any) => Number(b.revenue) - Number(a.revenue)).slice(0, 10)
    const totalProducts = rows.length
    const topProduct = rows.length ? rows.reduce((a: any, b: any) => Number(a.revenue) > Number(b.revenue) ? a : b) : null
    return (
      <>
        {renderSummaryCards([
          { label: "Products Sold", value: fnum(totalProducts) },
          { label: "Top Product", value: topProduct?.name ?? "—", color: "text-amber-600" },
          { label: "Top Revenue", value: topProduct ? fmoney(topProduct.revenue) : "—" },
        ])}
        {top10.length > 0 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Top Products by Revenue</h3>
              <ResponsiveContainer width="100%" height={Math.max(120, top10.length * 32)}>
                <BarChart data={top10} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip formatter={(v: any) => [fmoney(v), "Revenue"]} />
                  <Bar dataKey="revenue" fill={GOLD} barSize={16} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "name", label: "Product", format: "text" },
          { key: "qty", label: "Qty Sold", format: "number" },
          { key: "revenue", label: "Revenue", format: "money" },
          { key: "profit", label: "Profit", format: "money" },
        ])}
      </>
    )
  }

  function ReceivablesContent() {
    const rows = data?.rows ?? []
    const totalAR = rows.reduce((s: number, r: any) => s + Number(r.total), 0)
    const customerCount = rows.length
    const agingTotals = { d7: 0, d30: 0, d60: 0, d60plus: 0 }
    for (const r of rows) {
      agingTotals.d7 += Number(r.d7)
      agingTotals.d30 += Number(r.d30)
      agingTotals.d60 += Number(r.d60)
      agingTotals.d60plus += Number(r.d60plus)
    }
    const agingChartData = [
      { name: "0-7 days", value: agingTotals.d7, fill: "#22c55e" },
      { name: "8-30 days", value: agingTotals.d30, fill: GOLD },
      { name: "31-60 days", value: agingTotals.d60, fill: "#ea580c" },
      { name: "60+ days", value: agingTotals.d60plus, fill: "#dc2626" },
    ]
    return (
      <>
        {renderSummaryCards([
          { label: "Total AR", value: fmoney(totalAR), color: "text-amber-600" },
          { label: "Customers", value: fnum(customerCount) },
          { label: "0-7 days", value: fmoney(agingTotals.d7), color: "text-green-600" },
          { label: "60+ days", value: fmoney(agingTotals.d60plus), color: "text-red-600" },
        ])}
        {agingChartData.some(d => d.value > 0) && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Aging Summary</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agingChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [fmoney(v), undefined]} />
                  <Bar dataKey="value" radius={[2,2,0,0]}>
                    {agingChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "name", label: "Customer", format: "text" },
          { key: "total", label: "Total", format: "money" },
          { key: "d7", label: "0-7 days", format: "money" },
          { key: "d30", label: "8-30 days", format: "money" },
          { key: "d60", label: "31-60 days", format: "money" },
          { key: "d60plus", label: "60+ days", format: "money" },
        ])}
      </>
    )
  }

  function InventoryContent() {
    const rows = data?.rows ?? []
    const totalItems = rows.length
    const totalValue = rows.reduce((s: number, r: any) => s + Number(r.value), 0)
    const lowCount = rows.filter((r: any) => r.status === "low" || r.status === "out").length
    return (
      <>
        {renderSummaryCards([
          { label: "Total Items", value: fnum(totalItems) },
          { label: "Total Value", value: fmoney(totalValue), color: "text-amber-600" },
          { label: "Low/Out Stock", value: fnum(lowCount), color: lowCount > 0 ? "text-red-600" : "text-green-700" },
        ])}
        {rows.length > 0 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Stock Levels</h3>
              <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 28)}>
                <BarChart data={rows} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip formatter={(v: any, name: any) => [fnum(v), "On Hand"]} />
                  <Bar dataKey="onHand" barSize={14} radius={[0, 4, 4, 0]}>
                    {rows.map((r: any, i: number) => (
                      <Cell key={i} fill={r.status === "out" ? RED : r.status === "low" ? ORANGE : GOLD} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "name", label: "Product", format: "text" },
          { key: "onHand", label: "On Hand", format: "number" },
          { key: "value", label: "Value", format: "money" },
          { key: "status", label: "Status", format: "text" },
        ])}
      </>
    )
  }

  function VoidsContent() {
    const rows = data?.rows ?? []
    const voidCount = rows.filter((r: any) => r.type === "voided").length
    const refundCount = rows.filter((r: any) => r.type === "refunded").length
    const totalVoided = rows.reduce((s: number, r: any) => s + Number(r.total), 0)
    const reasonMap = new Map<string, number>()
    for (const r of rows) {
      const reason = r.reason || "No reason"
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
    }
    const reasonData = [...reasonMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason: reason.length > 20 ? reason.slice(0, 20) + "..." : reason, count }))
    return (
      <>
        {renderSummaryCards([
          { label: "Voids", value: fnum(voidCount), color: "text-red-600" },
          { label: "Refunds", value: fnum(refundCount), color: "text-amber-600" },
          { label: "Total Amount", value: fmoney(totalVoided), color: "text-red-600" },
        ])}
        {reasonData.length > 0 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Void Reasons</h3>
              <ResponsiveContainer width="100%" height={Math.max(100, reasonData.length * 40)}>
                <BarChart data={reasonData} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip formatter={(v: any) => [fnum(v), "Count"]} />
                  <Bar dataKey="count" fill={RED} barSize={16} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {renderTable(rows, [
          { key: "date", label: "Date", format: "date" },
          { key: "saleNumber", label: "Receipt #", format: "number" },
          { key: "total", label: "Amount", format: "money" },
          { key: "type", label: "Type", format: "text" },
          { key: "reason", label: "Reason", format: "text" },
        ])}
      </>
    )
  }

  function ZReadingContent() {
    if (!data) return null
    return (
      <Card className="bg-gold-200/90 border-amber-300/60 max-w-lg mx-auto text-stone-800 text-sm">
        <CardContent className="p-6 space-y-3">
          <div className="text-center">
            <h2 className="font-bold text-lg">Z-READING</h2>
            <p className="text-xs text-stone-500">{from} to {to}</p>
          </div>
          <div className="space-y-1 border-y border-amber-300/60 py-2">
            <div className="flex justify-between"><span>Gross Sales</span><span>{fmoney(data.gross)}</span></div>
            <div className="flex justify-between"><span className="text-red-600">Discounts</span><span className="text-red-600">-{fmoney(data.discounts)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{fmoney(data.tax)}</span></div>
            <div className="flex justify-between font-bold text-amber-600"><span>NET SALES</span><span>{fmoney(data.net)}</span></div>
          </div>
          <div className="flex justify-between"><span>Cash</span><span>{fmoney(data.cash)}</span></div>
          <div className="flex justify-between"><span>GCash</span><span>{fmoney(data.gcash)}</span></div>
          <div className="flex justify-between"><span>Sales Count</span><span>{data.saleCount}</span></div>
          <div className="flex justify-between"><span className="text-red-600">Voids</span><span>{data.voids}</span></div>
          <div className="flex justify-between"><span className="text-amber-600">Refunds</span><span>{data.refunds}</span></div>
          {data.hourly?.length > 0 && (
            <div className="border-t border-amber-300/60 pt-2">
              <p className="font-semibold mb-1">Hourly</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={data.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => `${String(v).padStart(2, "0")}:00`} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [fmoney(v), undefined]} />
                  <Bar dataKey="total" fill={GOLD} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {data.topItems?.length > 0 && (
            <div className="border-t border-amber-300/60 pt-2">
              <p className="font-semibold mb-1">Top 5 Items</p>
              {data.topItems.map((t: any, i: number) => <div key={i} className="flex justify-between text-xs"><span>{i + 1}. {t.name}</span><span>{fmoney(t.revenue)}</span></div>)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  function SalesDetailContent() {
    const rows = data?.rows ?? []
    return renderTable(rows, [
      { key: "time", label: "Time", format: "date" },
      { key: "sale_number", label: "Sale #", format: "text" },
      { key: "cashier", label: "Cashier", format: "text" },
      { key: "item_name", label: "Item", format: "text" },
      { key: "qty", label: "Qty", format: "number" },
      { key: "unit", label: "Unit", format: "text" },
      { key: "unit_price", label: "Unit Price", format: "money" },
      { key: "total_cost", label: "Total Cost", format: "money" },
      { key: "profit", label: "Profit", format: "money" },
      { key: "discount_amount", label: "Discount", format: "money" },
      { key: "tax_amount", label: "Tax", format: "money" },
      { key: "line_total", label: "Line Total", format: "money" },
      { key: "payment_amount", label: "Payment", format: "money" },
    ])
  }

  function CashFlowContent() {
    const rows = data?.rows ?? []
    const expCat = data?.expensesByCategory ?? []
    const summary = data?.summary ?? {}
    const totalExpCat = expCat.reduce((s: number, r: any) => s + Number(r.amount), 0)
    return (
      <>
        {renderSummaryCards([
          { label: "Cash In (Sales)", value: fmoney(summary.totalCashIn ?? 0), color: "text-blue-700" },
          { label: "GCash In", value: fmoney(summary.totalGcashIn ?? 0), color: "text-purple-700" },
          { label: "Collections", value: fmoney(summary.totalCollections ?? 0), color: "text-amber-600" },
          { label: "Expenses", value: fmoney(summary.totalExpenses ?? 0), color: "text-red-600" },
          { label: "Net Cash Flow", value: fmoney(summary.netCashFlow ?? 0), color: (summary.netCashFlow ?? 0) >= 0 ? "text-green-700" : "text-red-600" },
        ])}
        {/* Cash Flow Trend — Line Chart */}
        {rows.length > 1 && (
          <Card className="bg-gold-200/90 border-amber-300/60 mb-4">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Cash Flow Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => fdate(v)} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `₱${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [fmoney(v), undefined]} labelFormatter={l => fdate(l)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="cashSales" stroke={BLUE} strokeWidth={2} name="Cash In" dot={{ fill: BLUE, r: 2 }} />
                  <Line type="monotone" dataKey="gcashSales" stroke={PURPLE} strokeWidth={2} name="GCash In" dot={{ fill: PURPLE, r: 2 }} />
                  <Line type="monotone" dataKey="collections" stroke={ORANGE} strokeWidth={1.5} name="Collections" dot={false} />
                  <Line type="monotone" dataKey="expenses" stroke={RED} strokeWidth={2} name="Expenses" dot={{ fill: RED, r: 2 }} />
                  <Line type="monotone" dataKey="netCashFlow" stroke={GREEN} strokeWidth={2} name="Net Cash Flow" dot={{ fill: GREEN, r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {/* Expenses by Category — Donut Chart */}
        {expCat.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="bg-gold-200/90 border-amber-300/60">
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold text-stone-500 mb-2 uppercase tracking-wider">Expenses Breakdown</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={expCat} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {expCat.map((_: any, i: number) => <Cell key={i} fill={[RED, ORANGE, GOLD, PURPLE, BLUE, "#06b6d4", "#84cc16"][i % 7]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [fmoney(v), undefined]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-gold-200/90 border-amber-300/60 overflow-x-auto">
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-amber-300/60"><th className="text-left px-3 py-2 text-stone-500 font-medium">Category</th><th className="text-right px-3 py-2 text-stone-500 font-medium">Amount</th><th className="text-right px-3 py-2 text-stone-500 font-medium">%</th><th className="px-3 py-2 text-stone-500 font-medium w-1/2"></th></tr></thead>
                  <tbody>
                    {expCat.map((r: any, i: number) => {
                      const pct = totalExpCat > 0 ? (Number(r.amount) / totalExpCat) * 100 : 0
                      return (
                        <tr key={i} className="border-b border-amber-300/60 hover:bg-gold-200/50">
                          <td className="px-3 py-1.5 text-stone-700 capitalize">{r.category}</td>
                          <td className="px-3 py-1.5 text-right text-stone-700 tabular-nums">{fmoney(r.amount)}</td>
                          <td className="px-3 py-1.5 text-right text-stone-700 tabular-nums">{fnum(pct, 1)}%</td>
                          <td className="px-3 py-1.5">
                            <div className="h-2 bg-stone-300/40 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-amber-300/60 font-semibold"><td className="px-3 py-1.5 text-stone-700">Total</td><td className="px-3 py-1.5 text-right text-stone-700 tabular-nums">{fmoney(totalExpCat)}</td><td className="px-3 py-1.5 text-right text-stone-700 tabular-nums">100%</td><td className="px-3 py-1.5"></td></tr></tfoot>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Daily Breakdown Table */}
        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Daily Breakdown</h3>
        {renderTable(rows, [
          { key: "date", label: "Date", format: "date" },
          { key: "cashSales", label: "Cash Sales", format: "money" },
          { key: "gcashSales", label: "GCash Sales", format: "money" },
          { key: "collections", label: "Collections", format: "money" },
          { key: "expenses", label: "Expenses", format: "money" },
          { key: "netCashFlow", label: "Net Cash Flow", format: "money" },
        ])}
      </>
    )
  }

  function ConsignmentContent() {
    const rows = data?.rows ?? []
    const summary = data?.summary ?? {}
    return (
      <>
        {renderSummaryCards([
          { label: "Total Settled", value: fmoney(summary.totalSettled ?? 0), color: "text-red-600" },
          { label: "Total Qty Settled", value: fnum(summary.totalQty ?? 0) },
          { label: "Settlements", value: fnum(summary.settlementCount ?? 0) },
        ])}
        {renderTable(rows, [
          { key: "date", label: "Date", format: "date" },
          { key: "item", label: "Item", format: "text" },
          { key: "supplier", label: "Supplier", format: "text" },
          { key: "qtySold", label: "Qty Sold", format: "number" },
          { key: "unitPrice", label: "Unit Price", format: "money" },
          { key: "totalAmount", label: "Total Paid", format: "money" },
          { key: "note", label: "Note", format: "text" },
        ])}
      </>
    )
  }

  function renderContent() {
    if (loading) return <div className="flex justify-center py-16"><Loader2Icon className="h-8 w-8 animate-spin text-amber-600" /></div>
    if (!data) return <p className="text-stone-500 text-center py-16">Select a report type above</p>

    switch (activeTab) {
      case "sales": return <SalesContent />
      case "profit": return <ProfitContent />
      case "products": return <ProductsContent />
      case "receivables": return <ReceivablesContent />
      case "inventory": return <InventoryContent />
      case "voids": return <VoidsContent />
      case "zreading": return <ZReadingContent />
      case "salesdetail": return <SalesDetailContent />
      case "cashflow": return <CashFlowContent />
      case "consignments": return <ConsignmentContent />
      default: return <p className="text-stone-500 text-center py-16">Select a report type above</p>
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <div className="flex gap-2">
            <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-gold-100 border border-amber-300/60 text-stone-800 rounded-lg px-3 py-1.5 text-sm">
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 bg-gold-100 border-amber-300/60 text-stone-800 h-9" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 bg-gold-100 border-amber-300/60 text-stone-800 h-9" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === t.key ? "bg-primary text-white" : "bg-gold-100 text-stone-500 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {renderContent()}
      </div>
    </div>
  )
}
