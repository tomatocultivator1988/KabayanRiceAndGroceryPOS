// Offline sync: replays queued operations to the server in strict order
// OPEN → SALES → CLOSE. CLOSE is never attempted while the sale queue is
// non-empty, because shift figures are computed from sales.created_at between
// shift open/close — a sale synced after closed_at would be excluded.

import { offlineStore } from "./store"

export function pendingCount(): number {
  return offlineStore.getQueue().length + (offlineStore.getClientShift()?.closingCash !== undefined ? 1 : 0)
}

export function hasPending(): boolean {
  return pendingCount() > 0
}

function recordFail(step: "open" | "sale" | "close", message: string, clientRef: string | null = null) {
  offlineStore.setLastError({ step, clientRef, message, at: new Date().toISOString() })
}

// Dedupe concurrent sync attempts: the auto-sync effect (online event) and the
// manual drains (open/close modal) can fire at the same time. Sharing the
// in-flight promise avoids double POSTs and read-modify-write races on the queue.
let inFlight: Promise<{ synced: number; failed: number }> | null = null

export function syncNow(): Promise<{ synced: number; failed: number }> {
  if (inFlight) return inFlight
  inFlight = doSync().finally(() => { inFlight = null })
  return inFlight
}

async function doSync(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  // 1. OPEN — only if the shift was opened offline and not yet synced
  const shift = offlineStore.getClientShift()
  if (shift && !shift.openSynced) {
    let res: Response
    try {
      res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_cash: shift.openingCash,
          opening_denoms: shift.openingDenoms || {},
          opening_gcash: shift.openingGcash,
        }),
      })
    } catch {
      recordFail("open", "Network error")
      return { synced, failed: failed + 1 }
    }
    if (res.ok) {
      offlineStore.setClientShift({ ...shift, openSynced: true })
      synced++
    } else {
      // Response lost mid-open: the server may have opened the shift already.
      // Treat "already open" as synced instead of halting every queued sale.
      const msg = await res.json().catch(() => null)
      if (res.status === 400 && /already open/i.test(msg?.error ?? "")) {
        offlineStore.setClientShift({ ...shift, openSynced: true })
        synced++
      } else {
        recordFail("open", msg?.error ?? `HTTP ${res.status}`)
        return { synced, failed: failed + 1 }
      }
    }
  }

  // 2. SALES — drain fully; halt on the first failure so CLOSE never runs
  // while a sale is still pending.
  const queue = offlineStore.getQueue()
  for (const item of queue) {
    let res: Response
    try {
      res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item.body, clientRef: item.clientRef }),
      })
    } catch {
      recordFail("sale", "Network error", item.clientRef)
      return { synced, failed: failed + 1 }
    }
    if (res.ok) {
      const remaining = offlineStore.getQueue().filter(q => q.clientRef !== item.clientRef)
      offlineStore.setQueue(remaining)
      synced++
    } else {
      // Permanent failure (stock, deleted item, etc.) — surface it, don't retry-loop
      const msg = await res.json().catch(() => null)
      recordFail("sale", msg?.error ?? `HTTP ${res.status}`, item.clientRef)
      return { synced, failed: failed + 1 }
    }
  }

  // 3. CLOSE — only after the queue is drained
  const s = offlineStore.getClientShift()
  if (s && s.closingCash !== undefined && offlineStore.getQueue().length === 0) {
    let res: Response
    try {
      res = await fetch("/api/shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closing_cash: s.closingCash,
          closing_denoms: s.closingDenoms || {},
          note: s.note || null,
          closing_gcash: s.closingGcash || 0,
        }),
      })
    } catch {
      recordFail("close", "Network error")
      return { synced, failed: failed + 1 }
    }
    if (res.ok) {
      offlineStore.setClientShift(null)
      synced++
    } else {
      // Response lost mid-close: the shift may already be closed server-side.
      const msg = await res.json().catch(() => null)
      if (res.status === 400 && /no open shift/i.test(msg?.error ?? "")) {
        offlineStore.setClientShift(null)
        synced++
      } else {
        recordFail("close", msg?.error ?? `HTTP ${res.status}`)
        failed++
      }
    }
  }

  if (failed === 0) offlineStore.setLastError(null)
  return { synced, failed }
}
