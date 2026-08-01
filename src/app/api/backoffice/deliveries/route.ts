import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"
import { v4 as uuid } from "uuid"

// POST — record a delivery (increases stock only, no cost tracking)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const body = await request.json()
    const { supplier, note, items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items to receive" }, { status: 400 })
    }

    const errors: string[] = []
    const results: any[] = []

    for (const line of items) {
      const { itemId, quantity } = line
      if (!itemId) { errors.push("Item missing ID"); continue }
      if (quantity === undefined || Number(quantity) <= 0) { errors.push(`Item ${itemId}: invalid quantity`); continue }

      const { data: item } = await db.from("items")
        .select("stock_qty, name, cost").eq("id", itemId).eq("store_id", storeId).single()
      if (!item) { errors.push(`Item ${itemId}: not found in store`); continue }

      const oldQty = Number(item.stock_qty)
      const addQty = Number(quantity)
      const newQty = oldQty + addQty

      await db.from("items").update({ stock_qty: newQty }).eq("id", itemId)

      await db.from("inventory_log").insert({
        id: uuid(), store_id: storeId, item_id: itemId,
        change_qty: addQty, qty_before: oldQty, qty_after: newQty,
        reason: "delivery",
        note: `Delivery${supplier ? ` from ${supplier}` : ""}${note ? ` — ${note}` : ""}`,
        cost: Number(item.cost) || 0,
        employee_id: session.employeeId,
      })

      await db.from("audit_log").insert({
        id: uuid(), store_id: storeId, employee_id: session.employeeId,
        action: "stock_received", entity_type: "item", entity_id: itemId,
        old_value: { stock_qty: oldQty },
        new_value: { stock_qty: newQty },
      })

      results.push({ itemId, name: item.name, oldQty, newQty, added: addQty })
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 })
    }

    return NextResponse.json({ success: true, received: results })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
