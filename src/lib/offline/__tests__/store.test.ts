import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { offlineStore } from "../store"

describe("offlineStore", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it("queue round-trips and persists", () => {
    expect(offlineStore.getQueue()).toEqual([])
    const sale = { clientRef: "abc", body: { total: 10 }, createdAt: new Date().toISOString() }
    offlineStore.setQueue([sale])
    expect(offlineStore.getQueue()).toEqual([sale])
  })

  it("clientShift round-trips and clears", () => {
    const shift = {
      openedAt: new Date().toISOString(), openingCash: 500, openingGcash: 0,
      cashSales: 0, gcashSales: 0, cashCollections: 0, gcashCollections: 0,
      openSynced: false,
    }
    offlineStore.setClientShift(shift)
    expect(offlineStore.getClientShift()).toEqual(shift)
    offlineStore.setClientShift(null)
    expect(offlineStore.getClientShift()).toBeNull()
  })

  it("offline receipt numbers increment", () => {
    expect(offlineStore.getLastOfflineNum()).toBe(0)
    const n = offlineStore.getLastOfflineNum() + 1
    offlineStore.setLastOfflineNum(n)
    expect(offlineStore.getLastOfflineNum()).toBe(1)
    expect(offlineStore.getLastOfflineNum() + 1).toBe(2)
  })

  it("returns fallbacks for unset keys", () => {
    expect(offlineStore.getCatalog()).toEqual([])
    expect(offlineStore.getSession()).toBeNull()
    expect(offlineStore.getCart()).toBeNull()
  })

  it("retries a queue write after dropping the catalog when quota is exceeded", () => {
    offlineStore.setCatalog([{ id: 1 }])
    const orig = Storage.prototype.setItem
    let calls = 0
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      calls++
      if (calls === 1 && k === "ricepos:offline:v1:queue") throw new Error("QuotaExceeded")
      orig.call(this, k, v)
    })
    const sale = { clientRef: "abc", body: { total: 10 }, createdAt: new Date().toISOString() }
    offlineStore.setQueue([sale])
    // Queue survives the quota hit; catalog sacrificed for it
    expect(offlineStore.getQueue()).toEqual([sale])
    expect(localStorage.getItem("ricepos:offline:v1:catalog")).toBeNull()
  })
})
