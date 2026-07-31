// Mirrors the server's payment allocation so the clientShift ledger matches the
// DB shift figures: GCash first (digital, exact), then cash covers the remainder.
export function allocateGcashFirst(total: number, cash: number, gcash: number): { cashAlloc: number; gcashAlloc: number } {
  const round2 = (v: number) => Math.round((v + 1e-12) * 100) / 100
  const gcashAlloc = Math.min(gcash, total)
  const cashAlloc = Math.min(cash, Math.max(0, total - gcashAlloc))
  return { cashAlloc: round2(cashAlloc), gcashAlloc: round2(gcashAlloc) }
}
