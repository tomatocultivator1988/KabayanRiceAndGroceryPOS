import "dotenv/config"
import { db } from "./client"
import { v4 as uuid } from "uuid"

// Land a starter grocery catalogue into the current store.
// Idempotent: skips products that already exist in the store, so it is safe to re-run.
// Usage: pnpm db:seed:grocery  (or)  npx tsx src/lib/db/seed-grocery.ts

interface Product {
  name: string
  cat: string
  cost: number
  price: number
  stock: number
  min?: number
  sellBy?: "unit" | "weight" | "piece"
}

const PRODUCTS: Product[] = [
  // Canned Goods
  { name: "Mega Sardines (Red) 155g", cat: "Canned Goods", cost: 22, price: 27, stock: 40, min: 10 },
  { name: "555 Sardines Spanish Style 155g", cat: "Canned Goods", cost: 30, price: 38, stock: 30, min: 8 },
  { name: "Argentina Corned Beef 150g", cat: "Canned Goods", cost: 50, price: 62, stock: 25, min: 6 },
  { name: "Purefoods Corned Beef 150g", cat: "Canned Goods", cost: 55, price: 68, stock: 20, min: 5 },
  { name: "Century Tuna 155g", cat: "Canned Goods", cost: 38, price: 48, stock: 24, min: 6 },
  // Noodles
  { name: "Lucky Me Pancit Canton X2", cat: "Noodles", cost: 18, price: 24, stock: 100, min: 20 },
  { name: "Lucky Me Beef Mami 60g", cat: "Noodles", cost: 9, price: 12, stock: 120, min: 20 },
  { name: "Lucky Me Seafood 60g", cat: "Noodles", cost: 8, price: 11, stock: 90, min: 15 },
  { name: "Payless Instant Noodles 55g", cat: "Noodles", cost: 15, price: 20, stock: 80, min: 12 },
  // Beverages
  { name: "Coca-Cola 1.5L", cat: "Beverages", cost: 68, price: 82, stock: 30, min: 8 },
  { name: "Coca-Cola Sakto 320ml", cat: "Beverages", cost: 45, price: 48, stock: 40, min: 10 },
  { name: "Sprite 1.5L", cat: "Beverages", cost: 68, price: 82, stock: 20, min: 6 },
  { name: "Royal 1.5L", cat: "Beverages", cost: 68, price: 82, stock: 20, min: 6 },
  { name: "Nestle Pure Life 1L", cat: "Beverages", cost: 20, price: 25, stock: 50, min: 12 },
  { name: "Zesto Family Choco 1L", cat: "Beverages", cost: 35, price: 42, stock: 30, min: 8 },
  // Snacks
  { name: "Skyflakes Crackers 25g", cat: "Snacks", cost: 6, price: 8, stock: 150, min: 25 },
  { name: "Piattos Cheese 70g", cat: "Snacks", cost: 30, price: 45, stock: 40, min: 8 },
  { name: "Nova 70g", cat: "Snacks", cost: 30, price: 45, stock: 40, min: 8 },
  { name: "Boy Bawang Barbecue 125g", cat: "Snacks", cost: 25, price: 32, stock: 35, min: 8 },
  { name: "Oreo 100g", cat: "Snacks", cost: 20, price: 26, stock: 30, min: 6 },
  // Condiments
  { name: "Silver Swan Soy Sauce 385ml", cat: "Condiments", cost: 25, price: 32, stock: 25, min: 5 },
  { name: "Datu Puti Vinegar 385ml", cat: "Condiments", cost: 25, price: 32, stock: 25, min: 5 },
  { name: "UFC Ketchup 320g", cat: "Condiments", cost: 25, price: 33, stock: 25, min: 5 },
  { name: "Magic Sarap 25g", cat: "Condiments", cost: 20, price: 28, stock: 40, min: 8 },
  { name: "Silver Swan Patis 385ml", cat: "Condiments", cost: 20, price: 28, stock: 20, min: 5 },
  // Cooking Essentials
  { name: "Royal Palm Cooking Oil 1L", cat: "Cooking Essentials", cost: 60, price: 85, stock: 25, min: 6 },
  { name: "Minola Cooking Oil 1L", cat: "Cooking Essentials", cost: 66, price: 92, stock: 20, min: 5 },
  { name: "Star Margarine Bar 100g", cat: "Cooking Essentials", cost: 15, price: 20, stock: 60, min: 10 },
  { name: "Iodized Table Salt 1kg", cat: "Cooking Essentials", cost: 12, price: 18, stock: 40, min: 8 },
  // Canned Milk & Dairy
  { name: "Bear Brand Milk 370ml", cat: "Canned Milk & Dairy", cost: 40, price: 60, stock: 30, min: 6 },
  { name: "Alaska Milk 370ml", cat: "Canned Milk & Dairy", cost: 40, price: 62, stock: 30, min: 6 },
  { name: "Milo 200ml", cat: "Canned Milk & Dairy", cost: 15, price: 20, stock: 30, min: 6 },
  { name: "Eggs (per piece)", cat: "Canned Milk & Dairy", cost: 7, price: 9, stock: 120, min: 30 },
  // Personal Care
  { name: "Safeguard Soap 140g", cat: "Personal Care", cost: 35, price: 46, stock: 40, min: 8 },
  { name: "Closeup Toothpaste 155g", cat: "Personal Care", cost: 40, price: 50, stock: 30, min: 6 },
  { name: "Colgate Cavity Protection 150g", cat: "Personal Care", cost: 70, price: 85, stock: 30, min: 6 },
  { name: "Grow Shampoo 110ml", cat: "Personal Care", cost: 35, price: 45, stock: 25, min: 5 },
  { name: "Safeguard Body Wash 900ml", cat: "Personal Care", cost: 90, price: 115, stock: 15, min: 4 },
  // Cleaning Supplies
  { name: "Zonrox Bleach 1L", cat: "Cleaning Supplies", cost: 90, price: 110, stock: 18, min: 5 },
  { name: "Joy Dishwashing Liquid 500ml", cat: "Cleaning Supplies", cost: 45, price: 60, stock: 30, min: 6 },
  { name: "Perla Laundry Bar 250g", cat: "Cleaning Supplies", cost: 15, price: 20, stock: 50, min: 10 },
  { name: "Zonrox Colorsafe Bleach 500ml", cat: "Cleaning Supplies", cost: 20, price: 30, stock: 25, min: 5 },
]

async function run() {
  const { data: store } = await db.from("stores").select("id").single()
  if (!store) { console.log("No store found"); process.exit(1) }
  const storeId = store.id

  // Existing items in this store (skip to stay idempotent)
  const { data: existingItems } = await db.from("items").select("name").eq("store_id", storeId)
  const existing = new Set((existingItems ?? []).map((i: any) => i.name.trim().toLowerCase()))

  // Ensure categories exist
  const catId = new Map<string, string>()
  const { data: existingCats } = await db.from("categories").select("id, name").eq("store_id", storeId)
  for (const c of (existingCats ?? [])) catId.set(c.name.trim(), c.id)

  const cats = [...new Set(PRODUCTS.map(p => p.cat))]
  for (const cat of cats) {
    if (catId.has(cat)) continue
    const id = uuid()
    await db.from("categories").insert({ id, store_id: storeId, name: cat })
    catId.set(cat, id)
  }

  let created = 0
  let skipped = 0
  for (const p of PRODUCTS) {
    if (existing.has(p.name.trim().toLowerCase())) { skipped++; continue }

    // Globally-unique 13-digit barcode from a base + random tail
    const barcode = "480" + String(Math.floor(1000000000 + Math.random() * 8999999999))

    const { error: itemErr } = await db.from("items").insert({
      store_id: storeId, name: p.name,
      category_id: catId.get(p.cat) ?? null,
      sell_by: p.sellBy || "unit",
      cost: p.cost, barcode,
      stock_qty: p.stock, min_stock: p.min ?? 0,
      discount_eligible: true, status: "active",
    }).select("id")
    if (itemErr) { console.log("Item error:", itemErr.message, p.name); continue }

    const { data: newItem } = await db.from("items")
      .select("id").eq("store_id", storeId).eq("name", p.name).maybeSingle()
    if (newItem) {
      await db.from("selling_units").insert({
        item_id: newItem.id, name: "Each",
        base_qty: 1, price: p.price, min_qty: 0.001,
        is_default: true, sort_order: 0, is_active: true,
      })
    }
    created++
  }
  console.log(`Done. Created ${created}, skipped ${skipped} existing.`)
}

run()