import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const { id } = await params

    const from = request.nextUrl.searchParams.get("from")
    const to = request.nextUrl.searchParams.get("to")

    let query = db
      .from("inventory_log")
      .select("id, created_at, reason, change_qty, qty_before, qty_after, note, employee_id, sale_id, cost")
      .eq("store_id", storeId)
      .eq("item_id", id)

    if (from) query = query.gte("created_at", from)
    if (to) query = query.lte("created_at", to + "T23:59:59.999Z")

    query = query.order("created_at", { ascending: false })

    const { data: movements, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const employeeIds = [...new Set((movements ?? []).map(m => m.employee_id).filter(Boolean))] as string[]
    const employeeMap: Record<string, string> = {}
    if (employeeIds.length > 0) {
      const { data: employees } = await db
        .from("employees")
        .select("id, name")
        .in("id", employeeIds)
      for (const e of employees ?? []) {
        employeeMap[e.id] = e.name
      }
    }

    const { data: itemArr } = await db
      .from("items")
      .select("cost")
      .eq("id", id)
      .eq("store_id", storeId)

    const standardCost = itemArr && itemArr.length > 0 ? Number(itemArr[0].cost) : 0

    const saleIds = [...new Set((movements ?? []).filter(m => m.reason === "sale" && m.sale_id).map(m => m.sale_id))] as string[]
    const salePriceMap: Record<string, number> = {}
    const saleCostMap: Record<string, number> = {}
    if (saleIds.length > 0) {
      const { data: saleItems } = await db
        .from("sale_items")
        .select("sale_id, unit_price, cost_at_sale")
        .in("sale_id", saleIds)
        .eq("item_id", id)
      for (const si of saleItems ?? []) {
        if (!salePriceMap[si.sale_id] || si.unit_price > salePriceMap[si.sale_id]) {
          salePriceMap[si.sale_id] = Number(si.unit_price)
        }
        if (si.cost_at_sale != null && saleCostMap[si.sale_id] === undefined) {
          saleCostMap[si.sale_id] = Number(si.cost_at_sale)
        }
      }
    }

    const rows = (movements ?? []).map(m => {
      const cq = Number(m.change_qty)
      const storedCost = m.cost != null ? Number(m.cost) : null
      const saleCost = m.reason === "sale" && m.sale_id ? saleCostMap[m.sale_id] ?? null : null
      return {
        id: m.id,
        created_at: m.created_at,
        reason: m.reason,
        qty_in: cq > 0 ? cq : 0,
        qty_out: cq < 0 ? Math.abs(cq) : 0,
        qty_before: m.qty_before,
        qty_after: m.qty_after,
        note: m.note,
        employee_name: m.employee_id ? employeeMap[m.employee_id] ?? null : null,
        cost: storedCost ?? saleCost ?? standardCost,
        sold_price: m.sale_id ? (salePriceMap[m.sale_id] ?? null) : null,
      }
    })

    return NextResponse.json({ movements: rows })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
