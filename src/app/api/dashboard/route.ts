import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const now = new Date()
    const today = now.toISOString().split("T")[0]
    const monthLabel = now.toLocaleString("en-PH", { month: "long", year: "numeric" })

    // Sales trend range: 7d | 14d | month (default)
    const range = request.nextUrl.searchParams.get("range") || "month"
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    let rangeLabel = monthLabel
    let trendDays: string[] = []
    let trendStartISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    if (range === "7d") {
      rangeLabel = "Last 7 Days"
      for (let i = 6; i >= 0; i--) trendDays.push(fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))
      trendStartISO = trendDays[0] + "T00:00:00"
    } else if (range === "14d") {
      rangeLabel = "Last 14 Days"
      for (let i = 13; i >= 0; i--) trendDays.push(fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))
      trendStartISO = trendDays[0] + "T00:00:00"
    } else {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      for (let d = 1; d <= lastDay; d++) trendDays.push(fmt(new Date(now.getFullYear(), now.getMonth(), d)))
    }

    const [
      { data: todaySales },
      { data: todayCash },
      { data: todayGcash },
      { data: outstanding },
      { data: lowStock },
      { data: todayExpenses },
      { data: recentSales },
      { data: lastCashCount },
      { data: salesTrend },
    ] = await Promise.all([
      // Today's sales total
      db.from("sales").select("id, total, balance, status").eq("store_id", storeId)
        .gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`)
        .not("status", "in", '("voided","refunded")'),
      // Cash today — exclude payments from voided/refunded sales
      db.from("payments").select("amount, sales!inner(status)").eq("method", "cash")
        .not("sales.status", "in", '("voided","refunded")')
        .gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`).eq("is_collection", false),
      // GCash today — exclude payments from voided/refunded sales
      db.from("payments").select("amount, sales!inner(status)").eq("method", "gcash")
        .not("sales.status", "in", '("voided","refunded")')
        .gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`).eq("is_collection", false),
      // Outstanding utang
      db.from("sales").select("balance").eq("store_id", storeId).in("status", ["unpaid", "partial"]),
      // Low stock
      db.from("items").select("id, stock_qty, min_stock").eq("store_id", storeId).eq("status", "active"),
      // Expenses today
      db.from("expenses").select("amount").eq("store_id", storeId).eq("date", today),
      // Recent 10 sales
      db.from("sales").select("id, sale_number, total, status, created_at")
        .eq("store_id", storeId).not("status", "in", '("voided","refunded")')
        .order("created_at", { ascending: false }).limit(10),
      // Last cash count
      db.from("cash_counts").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // Sales trend (range: last 7/14 days or current month)
      db.from("sales").select("total, created_at")
        .eq("store_id", storeId).not("status", "in", '("voided","refunded")')
        .gte("created_at", trendStartISO)
        .lte("created_at", `${today}T23:59:59`)
        .order("created_at", { ascending: true }),
    ])

    const todayTotal = (todaySales ?? []).reduce((s: number, r: any) => s + Number(r.total), 0)
    const cashTotal = (todayCash ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    const gcashTotal = (todayGcash ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    const outstandingTotal = (outstanding ?? []).reduce((s: number, r: any) => s + Number(r.balance), 0)
    const expensesToday = (todayExpenses ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    // Get today's sale IDs for this store (used by COGS and top products queries)
    const todaySaleIds = (todaySales ?? []).map((s: any) => s.id)

    // Top products + COGS from sale_items (scoped by store's sale_ids)
    let topProducts: any[] = []
    let todayCost: any[] = []
    if (todaySaleIds.length > 0) {
      const [{ data: tp }, { data: tc }] = await Promise.all([
        db.from("sale_items").select("item_name, deducted_qty")
          .in("sale_id", todaySaleIds).eq("status", "completed").limit(200),
        db.from("sale_items").select("cost_at_sale, base_qty_snapshot, qty")
          .in("sale_id", todaySaleIds).eq("status", "completed"),
      ])
      topProducts = tp ?? []
      todayCost = tc ?? []
    }
    const cogs = (todayCost ?? []).reduce((s: number, r: any) => {
      if (r.cost_at_sale == null) return s
      return s + (Number(r.cost_at_sale) * Number(r.qty) * Number(r.base_qty_snapshot))
    }, 0)

    // Count unknown-cost items
    const unknownCostCount = (todayCost ?? []).filter((r: any) => r.cost_at_sale == null).length
    const profitToday = todayTotal - cogs - expensesToday

    // Top products
    const productMap = new Map<string, number>()
    for (const si of (topProducts ?? [])) {
      const name = si.item_name || "Unknown"
      productMap.set(name, (productMap.get(name) || 0) + Number(si.deducted_qty))
    }
    const top5 = [...productMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    // Sales trend — every day in range filled (0 for days with no sales)
    const trendMap = new Map<string, number>()
    for (const s of (salesTrend ?? [])) {
      const d = new Date(s.created_at).toISOString().split("T")[0]
      trendMap.set(d, (trendMap.get(d) || 0) + Number(s.total))
    }
    const trend = trendDays.map(date => ({ date, total: trendMap.get(date) || 0 }))

    return NextResponse.json({
      todaySales: todayTotal,
      todayProfit: profitToday,
      todayCash: cashTotal,
      todayGcash: gcashTotal,
      outstandingUtang: outstandingTotal,
      lowStockCount: (lowStock ?? []).filter((i: any) => Number(i.stock_qty) <= Number(i.min_stock)).length,
      expensesToday,
      unknownCostItems: unknownCostCount,
      rangeLabel,
      recentSales: (recentSales ?? []).map((s: any) => ({
        id: s.id, saleNumber: s.sale_number, total: Number(s.total),
        status: s.status, createdAt: s.created_at,
      })),
      topProducts: top5.map(([name, qty]) => ({ name, qty })),
      salesTrend: trend.map(({ date, total }) => ({ date, total })),
      lastCashCount: lastCashCount ? {
        variance: Number((lastCashCount as any).variance),
        date: (lastCashCount as any).date,
      } : null,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
