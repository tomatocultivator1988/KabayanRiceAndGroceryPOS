// Bluetooth Thermal Printer Manager + ESC/POS Commands

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: any): Promise<any>
      getDevices(): Promise<any[]>
    }
  }
}

interface BluetoothDevice {
  name?: string
  gatt?: { connect(): Promise<any> }
}

interface BluetoothRemoteGATTServer {
  connected: boolean
  getPrimaryService(uuid: string): Promise<any>
}

interface BluetoothRemoteGATTCharacteristic {
  writeValueWithoutResponse(data: Uint8Array): Promise<void>
}

// Store paired device in memory so we don't re-pair every time
let pairedDevice: BluetoothDevice | null = null
let gattServer: BluetoothRemoteGATTServer | null = null
let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null

// Standard ESC/POS commands
const ESC = '\x1B'
const GS = '\x1D'

function bytes(...codes: number[]): Uint8Array {
  return new Uint8Array(codes)
}

const ASCII_REPLACE: Record<string, string> = {
  "\u2500": "-",  // ─ → -
  "\u20B1": "P",  // ₱ → P
  "\u00A0": " ",  // non-breaking space
  "\u2018": "'", "\u2019": "'", // smart quotes
  "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "--", // en/em dash
  "\u2026": "...",
  "\u00D7": "x", // ×
}

function toAscii(str: string): string {
  return str.replace(/[^\x00-\x7F]/g, (c) => ASCII_REPLACE[c] || "?")
}

function text(str: string): Uint8Array {
  const encoder = new TextEncoder()
  return encoder.encode(toAscii(str))
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

export interface ReceiptData {
  header: string
  subtitle: string
  items: { name: string; qty: number; price: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  amountTendered: number
  change: number
  orderNumber: string
  date: string
  cashier: string
  footer: string
}

// Pair with a Bluetooth printer via browser dialog
export async function pairPrinter(): Promise<boolean> {
  try {
    if (!('bluetooth' in navigator)) {
      console.warn('Web Bluetooth not supported')
      return false
    }
    const bt = (navigator as any).bluetooth

    pairedDevice = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    })
    if (!pairedDevice) return false

    gattServer = await pairedDevice.gatt?.connect() ?? null
    if (!gattServer) return false

    const service = await gattServer.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
    writeCharacteristic = characteristic

    // Save device info for reconnect
    localStorage.setItem('printer_paired', 'true')
    localStorage.setItem('printer_name', pairedDevice.name || 'Unknown')

    return true
  } catch (err) {
    console.warn('Printer pairing failed:', err)
    return false
  }
}

// Try to reconnect to a previously paired printer
export async function reconnectPrinter(): Promise<boolean> {
  try {
    if (!localStorage.getItem('printer_paired')) return false
    if (!('bluetooth' in navigator)) return false

    const devices = await (navigator as any).bluetooth.getDevices()
    for (const dev of devices) {
      try {
        pairedDevice = dev
        gattServer = await dev.gatt?.connect() ?? null
        if (!gattServer) continue
        const service = await gattServer.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
        const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
        writeCharacteristic = characteristic
        return true
      } catch {
        continue
      }
    }
    return false
  } catch {
    return false
  }
}

export function isPrinterConnected(): boolean {
  return writeCharacteristic !== null && gattServer?.connected === true
}

export function getPrinterName(): string {
  return localStorage.getItem('printer_name') || 'Not paired'
}

async function sendRaw(data: Uint8Array): Promise<boolean> {
  try {
    if (!writeCharacteristic) return false
    // Send in chunks (some printers can't handle large chunks)
    const CHUNK = 64
    for (let i = 0; i < data.length; i += CHUNK) {
      await writeCharacteristic.writeValueWithoutResponse(data.slice(i, Math.min(i + CHUNK, data.length)))
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return true
  } catch {
    return false
  }
}

// Build a complete ESC/POS receipt
function buildReceipt(data: ReceiptData): Uint8Array {
  const center = bytes(0x1B, 0x61, 1)
  const left = bytes(0x1B, 0x61, 0)
  const bold = bytes(0x1B, 0x45, 1)
  const normal = bytes(0x1B, 0x45, 0)
  const feed = bytes(0x0A)
  const cut = bytes(0x1D, 0x56, 0x42, 0x00)

  const parts: Uint8Array[] = []

  // Header
  parts.push(center)
  parts.push(bold)
  parts.push(text(data.header))
  parts.push(feed)
  parts.push(normal)
  parts.push(text(data.subtitle))
  parts.push(feed)
  parts.push(text('-'.repeat(32)))
  parts.push(feed)
  parts.push(left)

  // Order info
  parts.push(text(`Order: ${data.orderNumber}`))
  parts.push(feed)
  parts.push(text(`Date: ${data.date}`))
  parts.push(feed)
  parts.push(text(`Cashier: ${data.cashier}`))
  parts.push(feed)
  parts.push(text('-'.repeat(32)))
  parts.push(feed)

  // Items
  for (const item of data.items) {
    const priceStr = `P${item.price.toFixed(0)}`
    const qtyPrice = `x${item.qty}  ${priceStr}`
    parts.push(text(item.name.slice(0, 20).padEnd(20)))
    parts.push(text(qtyPrice.padStart(12)))
    parts.push(feed)
  }

  parts.push(text('-'.repeat(32)))
  parts.push(feed)

  // Totals
  parts.push(text(`Subtotal:`.padEnd(20) + `P${data.subtotal.toFixed(2)}`.padStart(12)))
  parts.push(feed)
  if (data.discount > 0) {
    parts.push(text(`Discount:`.padEnd(20) + `-P${data.discount.toFixed(2)}`.padStart(11)))
    parts.push(feed)
  }
  if (data.tax > 0) {
    parts.push(text(`Tax:`.padEnd(20) + `P${data.tax.toFixed(2)}`.padStart(12)))
    parts.push(feed)
  }
  parts.push(bold)
  parts.push(text(`TOTAL:`.padEnd(20) + `P${data.total.toFixed(2)}`.padStart(12)))
  parts.push(feed)
  parts.push(feed)
  parts.push(normal)

  // Payment
  parts.push(text(`Payment: ${data.paymentMethod}`))
  parts.push(feed)
  if (data.amountTendered > 0) {
    parts.push(text(`Tendered: P${data.amountTendered.toFixed(2)}`))
    parts.push(feed)
    parts.push(text(`Change: P${data.change.toFixed(2)}`))
    parts.push(feed)
  }

  parts.push(feed)
  parts.push(center)
  parts.push(text(data.footer))
  parts.push(feed)
  parts.push(feed)

  // Cut
  parts.push(cut)

  return concat(...parts)
}

// Print a receipt
export async function printReceipt(data: ReceiptData): Promise<boolean> {
  try {
    if (!isPrinterConnected()) {
      const reconnected = await reconnectPrinter()
      if (!reconnected) {
        // Fall back to browser print — only report success if the dialog opened.
        return openBrowserReceipt(data)
      }
    }
    const receipt = buildReceipt(data)
    return await sendRaw(receipt)
  } catch {
    // Try browser print as last resort
    try { return openBrowserReceipt(data) } catch { return false }
  }
}

// Browser-based receipt (opens print dialog). Returns true only if the print
// window actually opened (window.open can be silently blocked by the browser).
export function openBrowserReceipt(data: ReceiptData): boolean {
  const w = window.open("", "receipt", "width=320,height=600")
  if (!w) return false
  const opened = !!w.document
  const itemsHtml = data.items.map(i => `
    <tr>
      <td style="text-align:left;padding:1px 4px;">${i.name.slice(0, 22)}</td>
      <td style="text-align:right;padding:1px 4px;">x${i.qty}</td>
      <td style="text-align:right;padding:1px 4px;">₱${i.price.toFixed(2)}</td>
    </tr>
  `).join("")
  
  const discountRow = data.discount > 0 ? `
    <tr><td colspan="2" style="text-align:left;">Discount</td><td style="text-align:right;">-₱${data.discount.toFixed(2)}</td></tr>
  ` : ""
  const taxRow = data.tax > 0 ? `
    <tr><td colspan="2" style="text-align:left;">Tax</td><td style="text-align:right;">₱${data.tax.toFixed(2)}</td></tr>
  ` : ""

  w.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Receipt ${data.orderNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
      .center { text-align: center; }
      .line { border-top: 1px dashed #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { font-size: 11px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body onload="setTimeout(() => window.print(), 300)">
      <div class="center">
        <strong style="font-size:14px">${data.header}</strong><br/>
        <span style="font-size:10px">${data.subtitle}</span>
      </div>
      <div class="line"></div>
      <div style="font-size:10px">
        Receipt #: ${data.orderNumber}<br/>
        Date: ${data.date}<br/>
        Cashier: ${data.cashier}
      </div>
      <div class="line"></div>
      <table>${itemsHtml}</table>
      <div class="line"></div>
      <table>
        <tr><td colspan="2" style="text-align:left;">Subtotal</td><td style="text-align:right;">₱${data.subtotal.toFixed(2)}</td></tr>
        ${discountRow}
        ${taxRow}
        <tr><td colspan="2" style="text-align:left;font-weight:bold;">TOTAL</td><td style="text-align:right;font-weight:bold;">₱${data.total.toFixed(2)}</td></tr>
      </table>
      <div class="line"></div>
      <div style="font-size:10px">
        ${data.paymentMethod}<br/>
        ${data.amountTendered > 0 ? `Tendered: ₱${data.amountTendered.toFixed(2)}` : ""}
        ${data.amountTendered > 0 && data.change > 0 ? `<br/>Change: ₱${data.change.toFixed(2)}` : ""}
      </div>
      <div class="line"></div>
      <div class="center" style="font-size:11px">${data.footer}</div>
    </body></html>
  `)
  w.document.close()
  return opened
}

// Open cash drawer via ESC/p command (printer RJ12 port)
export async function openDrawerViaPrinter(): Promise<boolean> {
  try {
    if (!isPrinterConnected()) {
      const reconnected = await reconnectPrinter()
      if (!reconnected) return false
    }
    // ESC p m t1 t2 = kick drawer pulse
    const drawerCmd = bytes(0x1B, 0x70, 0x00, 25, 250)
    return await sendRaw(drawerCmd)
  } catch {
    return false
  }
}

// Get saved drawer method preference
export function getDrawerMethod(): 'printer' | 'usb' | 'none' {
  const saved = localStorage.getItem('drawer_method')
  if (saved === 'printer' || saved === 'usb' || saved === 'none') return saved
  return 'printer' // default to printer
}

export function setDrawerMethod(method: 'printer' | 'usb' | 'none') {
  localStorage.setItem('drawer_method', method)
}

export function getAutoPrint(): boolean {
  return localStorage.getItem('auto_print') === 'true'
}

export function setAutoPrint(value: boolean) {
  localStorage.setItem('auto_print', value ? 'true' : 'false')
}
