import { describe, it, expect } from "vitest"
import { allocateGcashFirst } from "../alloc"

describe("allocateGcashFirst", () => {
  it("gcash covers the total first, cash stays unallocated", () => {
    expect(allocateGcashFirst(100, 300, 100)).toEqual({ cashAlloc: 0, gcashAlloc: 100 })
  })

  it("gcash first, cash covers the remainder", () => {
    expect(allocateGcashFirst(100, 50, 80)).toEqual({ cashAlloc: 20, gcashAlloc: 80 })
  })

  it("full cash when no gcash", () => {
    expect(allocateGcashFirst(120.5, 120.5, 0)).toEqual({ cashAlloc: 120.5, gcashAlloc: 0 })
  })

  it("overpayment allocates only up to the total", () => {
    expect(allocateGcashFirst(50, 100, 100)).toEqual({ cashAlloc: 0, gcashAlloc: 50 })
  })

  it("no payment allocates nothing", () => {
    expect(allocateGcashFirst(50, 0, 0)).toEqual({ cashAlloc: 0, gcashAlloc: 0 })
  })
})
