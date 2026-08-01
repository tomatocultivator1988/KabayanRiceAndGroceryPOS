import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const sp = request.nextUrl.searchParams
    const type = sp.get("type") || "sales"
    const from = sp.get("from") || new Date().toISOString().split("T")[0]
    const to = sp.get("to") || new Date().toISOString().split("T")[0]
    const fromTs = `${from}T00:00:00`
    const toTs = `${to}T23:59:59`

    if (type === "sales") {
      const { data: sales } = await db.from("sales")
        .select("total, created_at, id")
        .eq("store_id", storeId).not("status", "in", '("voided","refunded")')
        .gte("created_at", fromTs).lte("created_at", toTs)
      const saleIds = (sales ?? []).map((s: any) => s.id)
      let payments: any[] = []
      if (saleIds.length) {
        const { data: p } = await db.from("payments").select("method, amount, sale_id, created_at")
          .in("sale_id", saleIds).eq("is_collection", false)
        payments = p ?? []
      }
      // Build saleId → date map for correct payment grouping
      const saleDateMap = new Map<string, string>()
      for (const s of (sales ?? [])) saleDateMap.set(s.id, new Date(s.created_at).toISOString().split("T")[0])

      // Group by day
      const byDay = new Map<string, { count: number; cash: number; gcash: number; total: number }>()
      for (const s of (sales ?? [])) {
        const d = saleDateMap.get(s.id)!
        if (!byDay.has(d)) byDay.set(d, { count: 0, cash: 0, gcash: 0, total: 0 })
        const row = byDay.get(d)!; row.count++; row.total += Number(s.total)
      }
      for (const p of payments) {
        const d = saleDateMap.get(p.sale_id)
        if (!d) continue
        if (!byDay.has(d)) byDay.set(d, { count: 0, cash: 0, gcash: 0, total: 0 })
        const row = byDay.get(d)!
        if (p.method === "cash") row.cash += Number(p.amount)
        else if (p.method === "gcash") row.gcash += Number(p.amount)
      }
      const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({ date, ...r }))
      return NextResponse.json({ rows })
    }

    if (type === "profit") {
      const { data: items } = await db.from("sale_items")
        .select("line_total, cost_at_sale, qty, base_qty_snapshot, created_at, sale_id, sales!inner(store_id, status)")
        .gte("created_at", fromTs).lte("created_at", toTs)
        .eq("status", "completed")
      const { data: expenses } = await db.from("expenses")
        .select("amount, date").eq("store_id", storeId).gte("date", from).lte("date", to)

      const byDay = new Map<string, { revenue: number; cogs: number; expenses: number }>()
      for (const it of (items ?? [])) {
        if ((it as any).sales?.store_id !== storeId) continue
        const d = new Date(it.created_at).toISOString().split("T")[0]
        if (!byDay.has(d)) byDay.set(d, { revenue: 0, cogs: 0, expenses: 0 })
        const row = byDay.get(d)!
        row.revenue += Number(it.line_total)
        if (it.cost_at_sale != null) row.cogs += Number(it.cost_at_sale) * Number(it.qty) * Number(it.base_qty_snapshot)
      }
      for (const e of (expenses ?? [])) {
        if (!byDay.has(e.date)) byDay.set(e.date, { revenue: 0, cogs: 0, expenses: 0 })
        byDay.get(e.date)!.expenses += Number(e.amount)
      }
      const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({
        date, revenue: r.revenue, cogs: r.cogs, expenses: r.expenses,
        profit: r.revenue - r.cogs - r.expenses,
        margin: r.revenue > 0 ? ((r.revenue - r.cogs - r.expenses) / r.revenue) * 100 : 0,
      }))
      return NextResponse.json({ rows })
    }

    if (type === "products") {
      const { data: items } = await db.from("sale_items")
        .select("item_name, deducted_qty, line_total, cost_at_sale, qty, base_qty_snapshot, created_at, sales!inner(store_id, status)")
        .gte("created_at", fromTs).lte("created_at", toTs).eq("status", "completed")
      const map = new Map<string, { qty: number; revenue: number; profit: number }>()
      for (const it of (items ?? [])) {
        if ((it as any).sales?.store_id !== storeId) continue
        const name = it.item_name
        if (!map.has(name)) map.set(name, { qty: 0, revenue: 0, profit: 0 })
        const row = map.get(name)!
        row.qty += Number(it.deducted_qty)
        row.revenue += Number(it.line_total)
        const cost = it.cost_at_sale != null ? Number(it.cost_at_sale) * Number(it.qty) * Number(it.base_qty_snapshot) : 0
        row.profit += Number(it.line_total) - cost
      }
      const rows = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, r]) => ({ name, ...r }))
      return NextResponse.json({ rows })
    }

    if (type === "receivables") {
      const { data: sales } = await db.from("sales")
        .select("customer_id, balance, created_at, customers(name)")
        .eq("store_id", storeId).in("status", ["unpaid", "partial"])
      const map = new Map<string, { name: string; total: number; d7: number; d30: number; d60: number; d60plus: number }>()
      for (const s of (sales ?? [])) {
        if (!s.customer_id) continue
        const name = (s as any).customers?.name || "Unknown"
        if (!map.has(s.customer_id)) map.set(s.customer_id, { name, total: 0, d7: 0, d30: 0, d60: 0, d60plus: 0 })
        const row = map.get(s.customer_id)!
        const bal = Number(s.balance)
        row.total += bal
        const days = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000)
        if (days <= 7) row.d7 += bal
        else if (days <= 30) row.d30 += bal
        else if (days <= 60) row.d60 += bal
        else row.d60plus += bal
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total)
      return NextResponse.json({ rows })
    }

    if (type === "inventory") {
      const { data: items } = await db.from("items")
        .select("name, stock_qty, min_stock, cost, sell_by").eq("store_id", storeId).eq("status", "active")
      const rows = (items ?? []).map((i: any) => ({
        name: i.name, onHand: Number(i.stock_qty), value: Number(i.stock_qty) * Number(i.cost),
        status: Number(i.stock_qty) <= 0 ? "out" : Number(i.stock_qty) <= Number(i.min_stock) ? "low" : "ok",
        sellBy: i.sell_by,
      })).sort((a, b) => b.value - a.value)
      return NextResponse.json({ rows })
    }

    if (type === "voids") {
      const { data: sales } = await db.from("sales")
        .select("sale_number, total, status, void_reason, voided_at, created_at")
        .eq("store_id", storeId).in("status", ["voided", "refunded"])
        .gte("voided_at", fromTs).lte("voided_at", toTs)
      const rows = (sales ?? []).map((s: any) => ({
        saleNumber: s.sale_number, total: Number(s.total), type: s.status,
        reason: s.void_reason, date: s.voided_at || s.created_at,
      }))
      return NextResponse.json({ rows })
    }

    if (type === "zreading") {
      const { data: sales } = await db.from("sales")
        .select("total, subtotal, discount_amount, tax_total, status, created_at, id")
        .eq("store_id", storeId)
        .gte("created_at", fromTs).lte("created_at", toTs)
      const valid = (sales ?? []).filter((s: any) => s.status !== "voided" && s.status !== "refunded")
      const voids = (sales ?? []).filter((s: any) => s.status === "voided").length
      const refunds = (sales ?? []).filter((s: any) => s.status === "refunded").length
      const gross = valid.reduce((s: number, r: any) => s + Number(r.subtotal), 0)
      const discounts = valid.reduce((s: number, r: any) => s + Number(r.discount_amount), 0)
      const tax = valid.reduce((s: number, r: any) => s + Number(r.tax_total), 0)
      const net = valid.reduce((s: number, r: any) => s + Number(r.total), 0)

      const saleIds = valid.map((s: any) => s.id)
      let cash = 0, gcash = 0
      if (saleIds.length) {
        const { data: p } = await db.from("payments").select("method, amount").in("sale_id", saleIds).eq("is_collection", false)
        cash = (p ?? []).filter((x: any) => x.method === "cash").reduce((s: number, r: any) => s + Number(r.amount), 0)
        gcash = (p ?? []).filter((x: any) => x.method === "gcash").reduce((s: number, r: any) => s + Number(r.amount), 0)
      }
      // Hourly
      const hourly = new Map<number, { count: number; total: number }>()
      for (const s of valid) {
        const h = new Date(s.created_at).getHours()
        if (!hourly.has(h)) hourly.set(h, { count: 0, total: 0 })
        const row = hourly.get(h)!; row.count++; row.total += Number(s.total)
      }
      // Top 5 items
      let topItems: { name: string; revenue: number }[] = []
      if (saleIds.length) {
        const { data: items } = await db.from("sale_items").select("item_name, line_total").in("sale_id", saleIds).eq("status", "completed")
        const map = new Map<string, number>()
        for (const it of (items ?? [])) map.set(it.item_name, (map.get(it.item_name) || 0) + Number(it.line_total))
        topItems = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, revenue]) => ({ name, revenue }))
      }
      return NextResponse.json({
        gross, discounts, tax, net, cash, gcash,
        saleCount: valid.length, voids, refunds,
        hourly: [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([hour, r]) => ({ hour, ...r })),
        topItems,
      })
    }

    if (type === "salesdetail") {
      const { data: sales } = await db.from("sales")
        .select("id, sale_number, created_at, employee_id")
        .eq("store_id", storeId).not("status", "in", '("voided","refunded")')
        .gte("created_at", fromTs).lte("created_at", toTs)
        .order("created_at", { ascending: false }).limit(500)

      const saleIds = (sales ?? []).map((s: any) => s.id)
      if (saleIds.length === 0) return NextResponse.json({ rows: [] })

      const [itemsResult, paymentsResult, empResult] = await Promise.all([
        db.from("sale_items").select("item_name, qty, selling_unit_name, unit_price, discount_amount, tax_amount, line_total, cost_at_sale, base_qty_snapshot, sale_id").in("sale_id", saleIds).eq("status", "completed"),
        db.from("payments").select("sale_id, amount").in("sale_id", saleIds).eq("is_collection", false),
        db.from("employees").select("id, name"),
      ])

      const items = itemsResult.data ?? []
      const payments = paymentsResult.data ?? []
      const employees = empResult.data ?? []

      const employeeMap = new Map<string, string>()
      for (const e of employees) employeeMap.set(e.id, e.name)

      const paymentMap = new Map<string, number>()
      for (const p of payments) paymentMap.set(p.sale_id, (paymentMap.get(p.sale_id) || 0) + Number(p.amount))

      const itemBySale = new Map<string, any[]>()
      for (const it of items) {
        if (!itemBySale.has(it.sale_id)) itemBySale.set(it.sale_id, [])
        itemBySale.get(it.sale_id)!.push(it)
      }

      const rows: any[] = []
      for (const s of (sales ?? [])) {
        const saleItems = itemBySale.get(s.id) ?? []
        const paymentAmount = paymentMap.get(s.id) ?? 0
        for (const it of saleItems) {
          rows.push({
            time: s.created_at,
            sale_number: s.sale_number,
            cashier: employeeMap.get(s.employee_id) ?? null,
            item_name: it.item_name,
            qty: Number(it.qty),
            unit: it.selling_unit_name,
            unit_price: Number(it.unit_price),
            total_cost: it.cost_at_sale != null ? Number(it.cost_at_sale) * Number(it.qty) * Number(it.base_qty_snapshot) : null,
            profit: it.cost_at_sale != null ? Number(it.line_total) - (Number(it.cost_at_sale) * Number(it.qty) * Number(it.base_qty_snapshot)) : null,
            discount_amount: Number(it.discount_amount),
            tax_amount: Number(it.tax_amount),
            line_total: Number(it.line_total),
            payment_amount: paymentAmount,
          })
        }
      }

      return NextResponse.json({ rows })
    }

    if (type === "cashflow") {
      const { data: sales } = await db.from("sales")
        .select("id, total, created_at")
        .eq("store_id", storeId).not("status", "in", '("voided","refunded")')
        .gte("created_at", fromTs).lte("created_at", toTs)
      const saleIds = (sales ?? []).map((s: any) => s.id)
      let payments: any[] = []
      if (saleIds.length) {
        const { data: p } = await db.from("payments")
          .select("method, amount, sale_id, created_at, is_collection")
          .in("sale_id", saleIds)
        payments = p ?? []
      }
      const { data: expenses } = await db.from("expenses")
        .select("amount, date, category").eq("store_id", storeId)
        .gte("date", from).lte("date", to)

      const byDay = new Map<string, {
        cashSales: number; gcashSales: number; collections: number
        totalIn: number; expenses: number; txCount: number; expenseCount: number
      }>()
      const saleDateMap = new Map<string, string>()
      for (const s of (sales ?? [])) {
        const d = new Date(s.created_at).toISOString().split("T")[0]
        saleDateMap.set(s.id, d)
        if (!byDay.has(d)) byDay.set(d, { cashSales: 0, gcashSales: 0, collections: 0, totalIn: 0, expenses: 0, txCount: 0, expenseCount: 0 })
        byDay.get(d)!.txCount++
      }
      for (const p of payments) {
        const d = saleDateMap.get(p.sale_id)
        if (!d) continue
        if (!byDay.has(d)) byDay.set(d, { cashSales: 0, gcashSales: 0, collections: 0, totalIn: 0, expenses: 0, txCount: 0, expenseCount: 0 })
        const row = byDay.get(d)!
        if (p.is_collection) row.collections += Number(p.amount)
        else if (p.method === "cash") row.cashSales += Number(p.amount)
        else if (p.method === "gcash") row.gcashSales += Number(p.amount)
      }
      for (const e of (expenses ?? [])) {
        if (!byDay.has(e.date)) byDay.set(e.date, { cashSales: 0, gcashSales: 0, collections: 0, totalIn: 0, expenses: 0, txCount: 0, expenseCount: 0 })
        byDay.get(e.date)!.expenses += Number(e.amount)
        byDay.get(e.date)!.expenseCount++
      }
      const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({
        date,
        cashSales: r.cashSales, gcashSales: r.gcashSales,
        collections: r.collections,
        totalIn: r.cashSales + r.gcashSales + r.collections,
        expenses: r.expenses,
        netCashFlow: (r.cashSales + r.gcashSales + r.collections) - r.expenses,
        txCount: r.txCount, expenseCount: r.expenseCount,
      }))

      const totalCashIn = rows.reduce((s: number, r: any) => s + Number(r.cashSales), 0)
      const totalGcashIn = rows.reduce((s: number, r: any) => s + Number(r.gcashSales), 0)
      const totalCollections = rows.reduce((s: number, r: any) => s + Number(r.collections), 0)
      const totalExpenses = rows.reduce((s: number, r: any) => s + Number(r.expenses), 0)

      const expensesByCategory = new Map<string, number>()
      for (const e of (expenses ?? [])) {
        expensesByCategory.set(e.category, (expensesByCategory.get(e.category) || 0) + Number(e.amount))
      }

      return NextResponse.json({
        summary: { totalCashIn, totalGcashIn, totalCollections, totalExpenses, netCashFlow: totalCashIn + totalGcashIn + totalCollections - totalExpenses },
        expensesByCategory: [...expensesByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
        rows,
      })
    }

    if (type === "consignments") {
      const { data: settlements } = await db.from("consignment_settlements")
        .select("id, item_id, supplier_id, qty_sold, unit_price, total_amount, settled_at, note, items(name), suppliers(name)")
        .eq("store_id", storeId)
        .gte("settled_at", fromTs).lte("settled_at", toTs)
        .order("settled_at", { ascending: false })

      const rows = (settlements ?? []).map((s: any) => ({
        date: s.settled_at,
        item: (s as any).items?.name ?? "—",
        supplier: (s as any).suppliers?.name ?? "—",
        qtySold: s.qty_sold,
        unitPrice: Number(s.unit_price),
        totalAmount: Number(s.total_amount),
        note: s.note ?? "",
      }))

      const totalSettled = rows.reduce((s: number, r: any) => s + r.totalAmount, 0)
      const totalQty = rows.reduce((s: number, r: any) => s + r.qtySold, 0)

      return NextResponse.json({ summary: { totalSettled, totalQty, settlementCount: rows.length }, rows })
    }

    return NextResponse.json({ error: "Unknown report type" }, { status: 400 })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
