import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const from = request.nextUrl.searchParams.get("from")
    const to = request.nextUrl.searchParams.get("to")

    let query = db.from("shifts").select("*").eq("store_id", storeId)
    if (from) query = query.gte("opened_at", `${from}T00:00:00`)
    if (to) query = query.lte("opened_at", `${to}T23:59:59`)
    query = query.order("opened_at", { ascending: false })

    const { data: shifts } = await query

    // Attach employee names + live expected for open shifts
    const empIds = [...new Set((shifts ?? []).map((s: any) => s.employee_id).filter(Boolean))]
    const empMap = new Map<string, string>()
    if (empIds.length) {
      const { data: emps } = await db.from("employees").select("id, name").in("id", empIds as string[])
      ;(emps ?? []).forEach((e: any) => empMap.set(e.id, e.name))
    }

    const result = []
    for (const s of (shifts ?? [])) {
      let expectedCash = s.expected_cash
      let cashSales = s.cash_sales
      let cashCollections = s.cash_collections
      let gcashSales = s.gcash_sales
      let gcashCollections = s.gcash_collections
      let expectedGcash = s.expected_gcash
      // For open shifts, compute live
      if (s.status === "open") {
        const { data: pays } = await db.from("payments")
          .select("amount, is_collection, method").gte("created_at", s.opened_at)
        let cs = 0, cc = 0, gs = 0, gc = 0
        for (const p of (pays ?? [])) {
          if (p.method === "gcash") { if (p.is_collection) gc += Number(p.amount); else gs += Number(p.amount) }
          else { if (p.is_collection) cc += Number(p.amount); else cs += Number(p.amount) }
        }
        cashSales = cs; cashCollections = cc
        expectedCash = Number(s.opening_cash) + cs + cc
        gcashSales = gs; gcashCollections = gc
        expectedGcash = Number(s.opening_gcash || 0) + gs + gc
      }
      result.push({
        ...s,
        employeeName: empMap.get(s.employee_id) ?? "Unknown",
        cash_sales: cashSales,
        cash_collections: cashCollections,
        expected_cash: expectedCash,
        gcash_sales: gcashSales,
        gcash_collections: gcashCollections,
        expected_gcash: expectedGcash,
      })
    }

    return NextResponse.json({ shifts: result })
  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
