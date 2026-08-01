import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

// GET — live inventory view
export async function GET() {
  try {
    const session = await getSession()
    const storeId = session.storeId

    const { data: items } = await db.from("items")
      .select("id, name, category_id, sell_by, stock_qty, min_stock, cost, status")
      .eq("store_id", storeId).eq("status", "active")
      .order("name", { ascending: true })

    const formatted = (items ?? []).map((i: any) => ({
      ...i,
      value: Number(i.stock_qty) * Number(i.cost),
      stock_status: Number(i.stock_qty) <= 0 ? "out"
        : Number(i.stock_qty) <= Number(i.min_stock) ? "low" : "ok",
    }))

    return NextResponse.json({ items: formatted })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — stock adjustment
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const body = await request.json()
    const { itemId, adjustmentType, quantity, reason } = body

    if (!itemId) return NextResponse.json({ error: "Item required" }, { status: 400 })
    if (quantity === undefined || Number(quantity) === 0) return NextResponse.json({ error: "Quantity required" }, { status: 400 })

    const { data: item } = await db.from("items")
      .select("stock_qty, name, cost").eq("id", itemId).eq("store_id", storeId).single()
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

    const delta = Number(quantity)
    const oldQty = Number(item.stock_qty)
    const newQty = oldQty + delta

    if (newQty < 0) {
      return NextResponse.json({ error: `Adjustment would make stock negative (current: ${oldQty})` }, { status: 400 })
    }

    const adjReason: string = adjustmentType === "stock-in" ? "delivery"
      : adjustmentType === "return_to_supplier" ? "return_to_supplier"
      : "adjustment"
    const adjNote: string = reason || adjustmentType || "adjustment"

    const { error: updateErr } = await db.from("items")
      .update({ stock_qty: newQty })
      .eq("id", itemId).eq("store_id", storeId)

    if (updateErr) {
      console.error("inventory update error:", updateErr)
      return NextResponse.json({ error: "items update: " + updateErr.message }, { status: 500 })
    }

    const { error: logErr } = await db.from("inventory_log").insert({
      store_id: storeId,
      item_id: itemId,
      change_qty: delta,
      qty_before: oldQty,
      qty_after: newQty,
      reason: adjReason,
      note: adjNote,
      cost: Number(item.cost) || 0,
      employee_id: session.employeeId,
    })

    if (logErr) {
      console.error("inventory_log insert error:", logErr)
      return NextResponse.json({ error: "log insert: " + logErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, newQty })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    console.error("inventory POST unhandled:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
