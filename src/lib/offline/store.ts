// localStorage-backed offline store: catalog snapshot, cached session, sale queue, clientShift ledger.
// Everything is namespaced under ricepos:offline:v1:*.

const NS = "ricepos:offline:v1"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  const set = () => localStorage.setItem(`${NS}:${key}`, JSON.stringify(value))
  try {
    set()
  } catch {
    // Quota exceeded. Drop the biggest, most-expendable entry (catalog) and
    // retry once so the sale queue / shift ledger always survive; the catalog
    // is re-fetched whenever we're online.
    try { localStorage.removeItem(`${NS}:catalog`) } catch { /* give up */ }
    try { set() } catch { /* still full — entry lost, caller must handle */ }
  }
}

export interface QueuedSale {
  clientRef: string
  body: Record<string, unknown>
  createdAt: string
  ref?: string
}

export interface SyncError {
  step: "open" | "sale" | "close"
  clientRef: string | null
  message: string
  at: string
}

export interface ClientShift {
  openedAt: string
  openingCash: number
  openingGcash: number
  cashSales: number
  gcashSales: number
  cashCollections: number
  gcashCollections: number
  openSynced: boolean
  closingCash?: number
  closingGcash?: number
  closingDenoms?: Record<string, number>
  note?: string
}

export const offlineStore = {
  getCatalog: () => read<unknown[]>("catalog", []),
  setCatalog: (v: unknown[]) => write("catalog", v),
  getCategories: () => read<unknown[]>("categories", []),
  setCategories: (v: unknown[]) => write("categories", v),
  getSession: () => read<{ employee: { name: string; role: string } | null; storeId: string } | null>("session", null),
  setSession: (v: { employee: { name: string; role: string } | null; storeId: string } | null) => write("session", v),
  getQueue: () => read<QueuedSale[]>("queue", []),
  setQueue: (v: QueuedSale[]) => write("queue", v),
  getClientShift: () => read<ClientShift | null>("shift", null),
  setClientShift: (v: ClientShift | null) => write("shift", v),
  getLastOfflineNum: () => read<number>("num", 0),
  setLastOfflineNum: (v: number) => write("num", v),
  getLastError: () => read<SyncError | null>("err", null),
  setLastError: (v: SyncError | null) => write("err", v),
  getCart: () => read<{ carts: unknown[]; activeId: string | null; savedAt: number } | null>("cart", null),
  setCart: (v: { carts: unknown[]; activeId: string | null; savedAt: number } | null) => write("cart", v),
}
