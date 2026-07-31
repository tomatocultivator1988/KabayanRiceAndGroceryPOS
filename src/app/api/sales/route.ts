import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db/client"
import { getSession, unauth } from "@/lib/auth/session"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    const storeId = session.storeId
    const employeeId = session.employeeId
    const body = await request.json()

    const {
      items,           // CartItem[]
      payments,        // PaymentInput[]
      customerId,      // string | null
      discountType,    // string | null
      discountValue,   // number
      discountAmount,  // number
      discountName,    // string
      subtotal,        // number
      taxTotal,        // number
      deliveryFee,     // number
      total,           // number
      clientRef,       // string | null (offline idempotency)
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 })
    }
    if (!payments || !Array.isArray(payments)) {
      return NextResponse.json({ error: "Payment info required" }, { status: 400 })
    }

    // Sort payments: GCash first (digital, exact), then cash (for change)
    const sorted = [...payments].sort((a, b) =>
      a.method === "gcash" ? -1 : b.method === "gcash" ? 1 : 0
    )
    const paymentsTotal = sorted.reduce((sum: number, p: any) => sum + p.amount, 0)

    // Allocate payments: GCash first, cash covers remainder
    let remaining = total
    const recorded = sorted.map(p => {
      const alloc = Math.min(p.amount, remaining)
      remaining -= alloc
      return { ...p, recorded_amount: alloc }
    })
    const totalPaid = recorded.reduce((sum, p) => sum + p.recorded_amount, 0)
    const change = Math.max(0, paymentsTotal - totalPaid)
    const balance = total - totalPaid

    let saleStatus: string
    if (balance > 0 && totalPaid === 0) saleStatus = "unpaid"
    else if (balance > 0) saleStatus = "partial"
    else saleStatus = "completed"

    if (balance > 0 && !customerId) {
      return NextResponse.json({ error: "Customer required for short payment" }, { status: 400 })
    }

    // Call atomic RPC — locks items with FOR UPDATE, entire sale in one transaction
    const { data, error } = await db.rpc("process_sale", {
      p_store_id: storeId,
      p_employee_id: employeeId,
      p_items: items.map((i: any) => ({
        itemId: i.itemId, itemName: i.itemName, unitId: i.unitId, unitName: i.unitName,
        baseQty: i.baseQty, qty: i.qty, unitPrice: i.unitPrice, discountEligible: i.discountEligible,
      })),
      p_payments: recorded,
      p_customer_id: customerId || null,
      p_discount_type: discountType || null,
      p_discount_value: discountValue || 0,
      p_discount_amount: discountAmount || 0,
      p_discount_name: discountName || null,
      p_subtotal: subtotal,
      p_tax_total: taxTotal,
      p_delivery_fee: deliveryFee || 0,
      p_total: total,
      p_total_paid: totalPaid,
      p_balance: balance,
      p_change: change,
      p_sale_status: saleStatus,
      p_client_ref: clientRef || null,
    })

    if (error) {
      // Race fallback: a concurrent sync may have inserted the same client_ref,
      // tripping the unique index. Return the existing sale instead of failing.
      if (clientRef) {
        const { data: existing } = await db.from("sales")
          .select("id, sale_number, delivery_fee, total, amount_paid, balance, change, status")
          .eq("store_id", storeId)
          .eq("client_ref", clientRef)
          .maybeSingle()
        if (existing) {
          return NextResponse.json({
            sale: {
              id: existing.id, sale_number: existing.sale_number,
              deliveryFee: existing.delivery_fee || 0, total: existing.total,
              amount_paid: existing.amount_paid, balance: existing.balance,
              change: existing.change, status: existing.status,
            },
            duplicate: true,
          }, { status: 200 })
        }
      }
      return NextResponse.json({ error: `Sale failed: ${error.message}` }, { status: 500 })
    }

    const result = data as any
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Sale failed" }, { status: 400 })
    }

    // Idempotent replay of an already-processed offline sale — skip cart cleanup,
    // which would wipe the cashier's current active cart.
    if (result.duplicate) {
      return NextResponse.json({ sale: result.sale, duplicate: true }, { status: 200 })
    }

    // Clear only the active cart (preserve held carts for other customers/cashiers)
    const { data: currentCart } = await db.from("pos_carts")
      .select("cart_data").eq("shift_id", storeId).maybeSingle()
    const raw = currentCart?.cart_data
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as any).carts)) {
      const cd = raw as any
      // Remove the cart that was just sold (empty active)
      const remaining = cd.carts.filter((c: any) => !c.active || c.items.length > 0)
      // If remaining carts exist, set the last one as active
      if (remaining.length > 0) {
        remaining[remaining.length - 1].active = true
        await db.from("pos_carts").update({
          cart_data: { carts: remaining, activeId: remaining[remaining.length - 1].id },
          updated_at: new Date().toISOString(),
        }).eq("shift_id", storeId)
      } else {
        await db.from("pos_carts").update({
          cart_data: { carts: [], activeId: null },
          updated_at: new Date().toISOString(),
        }).eq("shift_id", storeId)
      }
    } else {
      await db.from("pos_carts").update({
        cart_data: { carts: [], activeId: null },
        updated_at: new Date().toISOString(),
      }).eq("shift_id", storeId)
    }

    return NextResponse.json({
      sale: {
        id: result.sale.id,
        sale_number: result.sale.sale_number,
        deliveryFee: result.sale.deliveryFee || 0,
        total: result.sale.total,
        amount_paid: result.sale.amountPaid,
        balance: result.sale.balance,
        change: result.sale.change,
        status: result.sale.status,
        payments: recorded.filter((p: any) => p.recorded_amount > 0).map((p: any) => ({
          method: p.method, amount: p.recorded_amount,
        })),
        items,
      }
    }, { status: 201 })

  } catch (error: any) {
    if (error.message === "Unauthorized") return unauth()
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 })
  }
}
