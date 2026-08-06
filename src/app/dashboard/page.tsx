"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2Icon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface DashboardData {
  todaySales: number; todayProfit: number; todayCash: number; todayGcash: number;
  outstandingUtang: number; lowStockCount: number; expensesToday: number;
  unknownCostItems: number;
  rangeLabel: string;
  recentSales: { id: string; saleNumber: number; total: number; status: string; createdAt: string }[];
  topProducts: { name: string; qty: number }[];
  salesTrend: { date: string; total: number }[];
  lastCashCount: { variance: number; date: string } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<"7d" | "14d" | "month">("month")

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/dashboard?range=${range}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2Icon className="h-8 w-8 animate-spin text-amber-600" /></div>

  const kpis = [
    { label: "Sales Today", value: `₱${(data?.todaySales ?? 0).toFixed(2)}`, color: "text-stone-800" },
    { label: "Profit Today", value: `${(data?.todayProfit ?? 0) >= 0 ? "₱" : "-₱"}${Math.abs(data?.todayProfit ?? 0).toFixed(2)}`, color: (data?.todayProfit ?? 0) >= 0 ? "text-green-700" : "text-red-600" },
    { label: "Cash Today", value: `₱${(data?.todayCash ?? 0).toFixed(2)}`, color: "text-blue-700" },
    { label: "GCash Today", value: `₱${(data?.todayGcash ?? 0).toFixed(2)}`, color: "text-purple-700" },
    { label: "Outstanding Utang", value: `₱${(data?.outstandingUtang ?? 0).toFixed(2)}`, color: data?.outstandingUtang ? "text-amber-600" : "text-stone-500" },
    { label: "Low Stock", value: `${data?.lowStockCount ?? 0} items`, color: data?.lowStockCount ? "text-red-600" : "text-stone-500" },
    { label: "Expenses Today", value: `₱${(data?.expensesToday ?? 0).toFixed(2)}`, color: "text-orange-700" },
    { label: "Cash Variance", value: data?.lastCashCount ? `${data.lastCashCount.variance >= 0 ? "+" : ""}₱${data.lastCashCount.variance.toFixed(2)}` : "—", color: (data?.lastCashCount?.variance ?? 0) === 0 ? "text-stone-500" : "text-red-600" },
  ]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      {data?.unknownCostItems ? <p className="text-xs text-amber-600">{data.unknownCostItems} sales today have unknown cost — profit is approximate</p> : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border-amber-300/60 bg-gold-200/90">
            <CardContent className="p-4">
              <p className="text-xs text-stone-500">{kpi.label}</p>
              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales Trend — Range filter + bar chart */}
      <Card className="border-amber-300/60 bg-gold-200/90">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-600">{data?.rangeLabel ?? "Monthly"} Sales</h2>
            <div className="flex gap-1 rounded-lg bg-gold-100/80 p-1">
              {([["7d", "7 Days"], ["14d", "14 Days"], ["month", "Month"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setRange(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${range === key ? "bg-primary text-primary-foreground" : "text-stone-500 hover:text-stone-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {data?.salesTrend.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.salesTrend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5d5a0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={v => String(new Date(v + "T00:00:00").getDate())} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                  formatter={(v: any) => [`₱${Number(v).toFixed(2)}`, "Sales"]} />
                <Bar dataKey="total" fill="#D4AF37" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-stone-500 py-8 text-center">No sales data yet</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products — Recharts */}
        <Card className="border-amber-300/60 bg-gold-200/90">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-amber-600 mb-3">Top Products Today</h2>
            {data?.topProducts.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip formatter={(v: any) => [v, "Qty Sold"]} />
                  <Bar dataKey="qty" fill="#D4AF37" barSize={16} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-stone-500 py-8 text-center">No sales yet today</p>}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card className="border-amber-300/60 bg-gold-200/90">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-stone-700 mb-3">Recent Sales</h2>
            {data?.recentSales.length ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {data.recentSales.map(s => (
                  <div key={s.id} className="flex justify-between items-center text-xs py-1 border-b border-amber-300/60">
                    <span className="text-stone-500">#{String(s.saleNumber).padStart(6, "0")}</span>
                    <span className={`${s.status === "completed" || s.status === "paid" ? "text-green-700" : s.status === "partial" || s.status === "unpaid" ? "text-amber-600" : "text-stone-500"}`}>
                      ₱{s.total.toFixed(2)}
                    </span>
                    <span className="text-stone-600">{new Date(s.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-stone-500">No sales yet today</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
