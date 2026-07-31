"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { offlineStore } from "@/lib/offline/store"

export interface CartItem {
  itemId: string
  itemName: string
  categoryId: string | null
  unitId: string
  unitName: string
  baseQty: number
  qty: number
  unitPrice: number
  stockQty: number
  sellBy: "weight" | "unit"
  taxRate: number
  discountEligible: boolean
}

export interface CartDiscount {
  type: "senior" | "pwd" | null
  value: number
  name: string
}

export interface CartState {
  items: CartItem[]
  discount: CartDiscount
}

export interface StoredCart extends CartState {
  id: string
  label: string
  active: boolean
  customerId: string | null
  customerName: string
  customerBalance: number
}

function emptyCart(id: string, label: string): StoredCart {
  return {
    id, label, active: true,
    items: [], discount: { type: null, value: 0, name: "" },
    customerId: null, customerName: "", customerBalance: 0,
  }
}

// ponytail: module-level counter for auto labels; resets on reload, fine for a single session
let cartSeq = 0
function nextCart(): StoredCart {
  cartSeq += 1
  return emptyCart(`c${Date.now()}_${cartSeq}`, `Customer #${cartSeq}`)
}

// Debounced write of carts to the server + localStorage mirror (offline survival).
// Module-level like cartSeq: one useCart instance drives the POS page.
let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCartSync(list: StoredCart[], actId: string | null) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    offlineStore.setCart({ carts: list, activeId: actId, savedAt: Date.now() })
    fetch("/api/pos/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart_data: { carts: list, activeId: actId } }),
    }).catch(() => {})
  }, 500)
}

export function useCart() {
  const initial = nextCart()
  const [carts, setCarts] = useState<StoredCart[]>([initial])
  const [activeId, setActiveId] = useState<string | null>(initial.id)
  const loadedRef = useRef(false)

  // Load carts from pos_carts on mount (falls back to the localStorage mirror when offline)
  useEffect(() => {
    const local = offlineStore.getCart()
    const localCarts = (local?.carts ?? []) as StoredCart[]
    const applyLocal = () => {
      if (localCarts.length > 0) {
        setCarts(localCarts)
        setActiveId(local?.activeId ?? localCarts.find(c => c.active)?.id ?? localCarts[0].id)
        cartSeq = localCarts.length
      }
    }
    fetch("/api/pos/cart").then(r => r.json()).then(d => {
      // Recency guard: the mirror is newer than the server copy (offline session
      // never got a successful POST) → restore it and push it back so the server
      // catches up, instead of letting the stale server copy clobber held carts.
      const serverUpdated = d.cart?.updated_at ? new Date(d.cart.updated_at).getTime() : 0
      if (local && localCarts.length > 0 && local.savedAt > serverUpdated) {
        applyLocal()
        scheduleCartSync(localCarts, local.activeId)
        loadedRef.current = true
        return
      }
      if (d.cart?.cart_data) {
        try {
          const raw = typeof d.cart.cart_data === "string" ? JSON.parse(d.cart.cart_data) : d.cart.cart_data
          if (raw && Array.isArray(raw.carts) && raw.carts.length > 0) {
            const list = raw.carts as StoredCart[]
            setCarts(list)
            setActiveId(raw.activeId ?? list.find(c => c.active)?.id ?? list[0].id)
            cartSeq = list.length
          } else if (raw && Array.isArray(raw.items)) {
            // Legacy single-cart shape
            const c = emptyCart("c_legacy", "Customer #1")
            c.items = raw.items
            c.discount = raw.discount ?? c.discount
            c.customerId = raw.customerId ?? null
            c.customerName = raw.customerName ?? ""
            c.customerBalance = raw.customerBalance ?? 0
            setCarts([c])
            setActiveId(c.id)
          }
        } catch { /* ignore corrupt cart */ }
      }
      loadedRef.current = true
    }).catch(() => {
      applyLocal()
      loadedRef.current = true
    })
  }, [])

  const active = carts.find(c => c.id === activeId) ?? null

  const sync = useCallback(() => {
    if (!loadedRef.current) return
    scheduleCartSync(carts, activeId)
  }, [carts, activeId])

  useEffect(() => { sync() }, [sync])

  // Merge key: itemId + unitId
  function mergeKey(item: Pick<CartItem, "itemId" | "unitId">) {
    return `${item.itemId}::${item.unitId}`
  }

  function mutateActive(fn: (c: StoredCart) => StoredCart) {
    if (!activeId) return
    setCarts(prev => prev.map(c => c.id === activeId ? fn(c) : c))
  }

  function addItem(item: CartItem) {
    mutateActive(c => {
      const key = mergeKey(item)
      const existing = c.items.findIndex(i => mergeKey(i) === key)
      if (existing >= 0) {
        const items = [...c.items]
        items[existing] = { ...items[existing], qty: items[existing].qty + item.qty }
        return { ...c, items }
      }
      return { ...c, items: [...c.items, item] }
    })
  }

  function updateQty(itemKey: string, qty: number) {
    mutateActive(c => ({ ...c, items: c.items.map(i => mergeKey(i) === itemKey ? { ...i, qty } : i).filter(i => i.qty > 0) }))
  }

  function removeItem(itemKey: string) {
    mutateActive(c => ({ ...c, items: c.items.filter(i => mergeKey(i) !== itemKey) }))
  }

  function clearCart() {
    mutateActive(c => ({ ...c, items: [], discount: { type: null, value: 0, name: "" }, customerId: null, customerName: "", customerBalance: 0 }))
  }

  function setDiscount(discount: CartDiscount) {
    mutateActive(c => ({ ...c, discount }))
  }

  function setCustomer(custId: string | null, name: string, balance: number) {
    mutateActive(c => ({ ...c, customerId: custId, customerName: name, customerBalance: balance }))
  }

  // Hold the active cart; create a fresh active cart. No-op if active is empty.
  function holdCurrentCart() {
    if (!active || active.items.length === 0) return
    const held: StoredCart = { ...active, active: false }
    const fresh = nextCart()
    setCarts(prev => [...prev.map(c => c.id === held.id ? held : c), fresh])
    setActiveId(fresh.id)
  }

  // Resume a held cart by id. If the current active cart is empty, discard it;
  // otherwise park it too so nothing is lost.
  function resumeCart(id: string) {
    setCarts(prev => {
      const target = prev.find(c => c.id === id)
      if (!target) return prev
      const discardActive = prev
        .filter(c => c.active && c.id !== id)
        .every(c => c.items.length === 0 && !c.customerId && c.discount.type === null)
      const next = prev
        .filter(c => !(c.active && c.id !== id && discardActive))
        .map(c => ({ ...c, active: c.id === id }))
      return next
    })
    setActiveId(id)
  }

  const heldCarts = carts.filter(c => !c.active)

  // Auto-resume the most recently held cart (used after a sale clears the active cart).
  function resumeMostRecentHeld() {
    const held = carts.filter(c => !c.active)
    if (held.length > 0) resumeCart(held[held.length - 1].id)
  }

  // Calculations (active cart only)
  const items = active?.items ?? []
  const discount = active?.discount ?? { type: null, value: 0, name: "" }
  const customerId = active?.customerId ?? null
  const customerName = active?.customerName ?? ""
  const customerBalance = active?.customerBalance ?? 0

  const subtotal = items.reduce((sum, i) => sum + (i.unitPrice * i.qty), 0)

  const eligibleTotal = items.filter(i => i.discountEligible).reduce((s, i) => s + (i.unitPrice * i.qty), 0)

  const discountAmount = (() => {
    if (!discount.type || discount.value <= 0) return 0
    const eligibleItems = items.filter(i => i.discountEligible)
    if (eligibleItems.length === 0) return 0
    return eligibleTotal * (discount.value / 100)
  })()

  const afterDiscount = subtotal - discountAmount

  const taxTotal = items.reduce((sum, i) => {
    const lineTotal = i.unitPrice * i.qty
    if (i.discountEligible && discount.type && discount.value > 0) {
      const discountShare = eligibleTotal > 0 ? discountAmount * (lineTotal / eligibleTotal) : 0
      return sum + ((lineTotal - discountShare) * i.taxRate)
    }
    return sum + (lineTotal * i.taxRate)
  }, 0)

  const total = afterDiscount + taxTotal

  const totalDeductedQty = items.reduce((sum, i) => sum + (i.qty * i.baseQty), 0)

  return {
    items, discount,
    customerId, customerName, customerBalance,
    subtotal, discountAmount, taxTotal, total, totalDeductedQty,
    carts, heldCarts, activeId,
    addItem, updateQty, removeItem, clearCart,
    setDiscount, setCustomer, mergeKey,
    holdCurrentCart, resumeCart, resumeMostRecentHeld,
  }
}
