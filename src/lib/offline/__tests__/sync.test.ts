import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { syncNow, hasPending, pendingCount } from "../sync"
import { offlineStore } from "../store"

function ok() {
  return { ok: true, json: async () => ({ shift: {}, sale: {} }) } as unknown as Response
}

function shift(over: Record<string, unknown> = {}) {
  return {
    openedAt: new Date().toISOString(), openingCash: 500, openingGcash: 0,
    cashSales: 0, gcashSales: 0, cashCollections: 0, gcashCollections: 0,
    openSynced: false,
    ...over,
  }
}

describe("syncNow", () => {
  const calls: string[] = []

  beforeEach(() => {
    localStorage.clear()
    calls.length = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push(`${opts?.method || "GET"} ${url}`)
      return ok()
    }) as unknown as typeof fetch
  })
  afterEach(() => vi.restoreAllMocks())

  it("syncs OPEN → SALES → CLOSE in strict order and clears lastError", async () => {
    offlineStore.setClientShift(shift())
    offlineStore.setQueue([{ clientRef: "c1", body: { total: 30 }, createdAt: new Date().toISOString() }])
    offlineStore.setClientShift({ ...offlineStore.getClientShift()!, closingCash: 520 })

    const { synced, failed } = await syncNow()

    expect(calls).toEqual(["POST /api/shifts", "POST /api/sales", "PUT /api/shifts"])
    expect(synced).toBe(3)
    expect(failed).toBe(0)
    expect(offlineStore.getQueue()).toEqual([])
    expect(offlineStore.getClientShift()).toBeNull()
    expect(offlineStore.getLastError()).toBeNull()
  })

  it("never sends CLOSE while the sale queue is non-empty", async () => {
    offlineStore.setClientShift(shift({ openSynced: true, closingCash: 500 }))
    offlineStore.setQueue([{ clientRef: "c1", body: { total: 30 }, createdAt: new Date().toISOString() }])

    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push(`${opts?.method || "GET"} ${url}`)
      if (String(url).includes("/api/sales")) {
        return { ok: false, json: async () => ({ error: "boom" }) } as unknown as Response
      }
      return ok()
    }) as unknown as typeof fetch

    const { synced, failed } = await syncNow()

    expect(calls).toEqual(["POST /api/sales"])
    expect(synced).toBe(0)
    expect(failed).toBe(1)
    // CLOSE not attempted — shift record preserved for a later retry
    expect(offlineStore.getClientShift()?.closingCash).toBe(500)
    expect(offlineStore.getQueue()).toHaveLength(1)
  })

  it("skips an already-synced open shift", async () => {
    offlineStore.setClientShift(shift({ openSynced: true }))
    const { synced } = await syncNow()
    expect(calls).toEqual([])
    expect(synced).toBe(0)
  })

  it("treats a 400 'already open' as a synced OPEN and continues to SALES", async () => {
    offlineStore.setClientShift(shift())
    offlineStore.setQueue([{ clientRef: "c1", body: { total: 30 }, createdAt: new Date().toISOString() }])

    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push(`${opts?.method || "GET"} ${url}`)
      if (String(url).includes("/api/shifts") && opts?.method === "POST") {
        return { ok: false, status: 400, json: async () => ({ error: "A shift is already open. Close it first." }) } as unknown as Response
      }
      return ok()
    }) as unknown as typeof fetch

    const { synced, failed } = await syncNow()

    expect(calls).toEqual(["POST /api/shifts", "POST /api/sales"])
    expect(synced).toBe(2)
    expect(failed).toBe(0)
    expect(offlineStore.getClientShift()?.openSynced).toBe(true)
    expect(offlineStore.getQueue()).toEqual([])
  })

  it("treats a 400 'no open shift' close as already closed", async () => {
    offlineStore.setClientShift(shift({ openSynced: true, closingCash: 500 }))

    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push(`${opts?.method || "GET"} ${url}`)
      if (String(url).includes("/api/shifts") && opts?.method === "PUT") {
        return { ok: false, status: 400, json: async () => ({ error: "No open shift to close" }) } as unknown as Response
      }
      return ok()
    }) as unknown as typeof fetch

    const { synced, failed } = await syncNow()

    expect(calls).toEqual(["PUT /api/shifts"])
    expect(synced).toBe(1)
    expect(failed).toBe(0)
    expect(offlineStore.getClientShift()).toBeNull()
  })

  it("dedupes concurrent syncNow calls into a single run", async () => {
    offlineStore.setClientShift(shift())

    const p1 = syncNow()
    const p2 = syncNow()
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r2).toBe(r1)
    expect(r1).toEqual({ synced: 1, failed: 0 })
    expect(calls).toEqual(["POST /api/shifts"])
  })

  it("records lastError on failure and clears it once a retry succeeds", async () => {
    offlineStore.setClientShift(shift({ openSynced: true }))
    offlineStore.setQueue([{ clientRef: "c1", body: {}, createdAt: new Date().toISOString() }])

    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/sales")) {
        return { ok: false, json: async () => ({ error: "Insufficient stock" }) } as unknown as Response
      }
      return ok()
    }) as unknown as typeof fetch

    await syncNow()
    expect(offlineStore.getLastError()?.message).toBe("Insufficient stock")

    global.fetch = vi.fn(async () => ok()) as unknown as typeof fetch
    await syncNow()
    expect(offlineStore.getLastError()).toBeNull()
    expect(offlineStore.getQueue()).toEqual([])
  })

  it("hasPending/pendingCount include a pending shift close", () => {
    expect(hasPending()).toBe(false)
    expect(pendingCount()).toBe(0)
    offlineStore.setClientShift(shift({ openSynced: true, closingCash: 500 }))
    expect(hasPending()).toBe(true)
    expect(pendingCount()).toBe(1)
  })
})
