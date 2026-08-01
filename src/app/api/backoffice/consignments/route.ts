import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"
import { v4 as uuid } from "uuid"

async function querySoldItems(itemId: string, lastSettledAt: string | null) {
  let query = db.from("sale_items")
    .select("qty, base_qty_snapshot, cost_at_sale, sale_id, sales!inner(status)")
    .eq("item_id", itemId)
    .neq("status", "voided").neq("status", "refunded")
    .in("sales.status", ["completed", "paid", "partial", "unpaid"])
  if (lastSettledAt) query = query.gt("created_at", lastSettledAt)
  return query
}

function computeTotals(soldItems: any[], fallbackPrice: number) {
  let soldQty = 0, totalCOGS = 0
  for (const si of soldItems) {
    const qty = Number(si.qty)
    const base = Number(si.base_qty_snapshot)
    const cost = si.cost_at_sale != null ? Number(si.cost_at_sale) : fallbackPrice
    soldQty += qty * base
    totalCOGS += cost * qty * base
  }
  return { soldQty, totalCOGS }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const sp = request.nextUrl.searchParams
    const type = sp.get("type") || "list"

    if (type === "history") {
      const itemId = sp.get("itemId")
      if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 })
      const { data } = await db.from("consignment_settlements")
        .select("*").eq("store_id", storeId).eq("item_id", itemId)
        .order("settled_at", { ascending: false })
      return NextResponse.json({ settlements: data ?? [] })
    }

    const { data: items } = await db.from("items")
      .select("id, name, cost, stock_qty, is_consignment, consignment_supplier_id, consignment_agreed_price, consignment_last_settled_at, suppliers(id, name)")
      .eq("store_id", storeId).eq("is_consignment", true).eq("status", "active")
      .order("name")

    const result = await Promise.all((items ?? []).map(async (item: any) => {
      const lastSettledAt = item.consignment_last_settled_at
      const fallbackPrice = Number(item.consignment_agreed_price ?? 0)
      const { data: soldItems } = await querySoldItems(item.id, lastSettledAt)
      const { soldQty, totalCOGS } = computeTotals(soldItems ?? [], fallbackPrice)

      return {
        id: item.id,
        name: item.name,
        stockQty: Number(item.stock_qty),
        supplierId: item.consignment_supplier_id,
        supplierName: (item as any).suppliers?.name ?? null,
        agreedPrice: fallbackPrice,
        lastSettledAt: item.consignment_last_settled_at ?? null,
        soldThisPeriod: soldQty,
        totalCOGSThisPeriod: totalCOGS,
      }
    }))

    return NextResponse.json({ items: result })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const body = await request.json()
    const { itemId, note } = body

    if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 })

    const { data: item } = await db.from("items")
      .select("id, name, stock_qty, is_consignment, consignment_supplier_id, consignment_agreed_price, consignment_last_settled_at")
      .eq("id", itemId).eq("store_id", storeId).single()

    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })
    if (!item.is_consignment) return NextResponse.json({ error: "Item is not a consignment item" }, { status: 400 })

    const prevLast = item.consignment_last_settled_at
    const fallbackPrice = Number(item.consignment_agreed_price ?? 0)

    const { data: soldItems } = await querySoldItems(itemId, prevLast)
    const { soldQty, totalCOGS } = computeTotals(soldItems ?? [], fallbackPrice)

    if (soldQty <= 0) return NextResponse.json({ error: "No sales to settle" }, { status: 400 })

    const unitPrice = totalCOGS > 0 ? totalCOGS / soldQty : fallbackPrice
    const now = new Date().toISOString()

    const { data: check } = await db.from("consignment_settlements")
      .select("id").eq("store_id", storeId).eq("item_id", itemId)
      .gt("settled_at", prevLast || "1970-01-01T00:00:00").limit(1)
    if (check && check.length > 0) return NextResponse.json({ error: "Already settled. Please refresh." }, { status: 409 })

    await db.from("consignment_settlements").insert({
      id: uuid(),
      store_id: storeId,
      item_id: itemId,
      supplier_id: item.consignment_supplier_id,
      qty_sold: Math.round(soldQty * 1000) / 1000,
      unit_price: Math.round(unitPrice * 100) / 100,
      total_amount: Math.round(totalCOGS * 100) / 100,
      settled_at: now,
      note: note || null,
      created_by: session.employeeId,
    })

    await db.from("items").update({ consignment_last_settled_at: now }).eq("id", itemId)

    await db.from("journal").insert({
      id: uuid(), store_id: storeId,
      event_type: "consignment_settled",
      employee_id: session.employeeId,
      details: {
        item_id: itemId, item_name: item.name,
        supplier_id: item.consignment_supplier_id,
        qty_sold: Math.round(soldQty * 1000) / 1000,
        unit_price: unitPrice,
        total_amount: Math.round(totalCOGS * 100) / 100,
      },
    })

    return NextResponse.json({
      success: true,
      settlement: {
        itemId, itemName: item.name,
        qtySold: Math.round(soldQty * 1000) / 1000,
        unitPrice: Math.round(unitPrice * 100) / 100,
        totalAmount: Math.round(totalCOGS * 100) / 100,
      },
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
