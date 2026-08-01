"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2Icon, PrinterIcon } from "lucide-react"

export function ShiftsManager() {
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0])
  const [to, setTo] = useState(new Date().toISOString().split("T")[0])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/shifts?from=${from}&to=${to}`).then(r => r.json()).then(d => {
      setShifts(d.shifts ?? [])
      setLoading(false)
    })
  }, [from, to])

  function printShiftReport(s: any) {
    const w = window.open("", "shift", "width=320,height=700")
    if (!w) return
    const denomRows = (obj: any) => {
      const keys = Object.keys(obj || {}).filter(k => obj[k] > 0).sort((a, b) => Number(b) - Number(a))
      return keys.map(k => "<tr><td>" + "₱" + Number(k).toLocaleString() + "</td><td style='text-align:center'>x" + obj[k] + "</td><td style='text-align:right'>" + "₱" + (Number(k) * obj[k]).toLocaleString(undefined, { minimumFractionDigits: 2 }) + "</td></tr>").join("")
    }
    const html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Shift Report</title>"
      + "<style>@page{size:80mm auto;margin:4mm}body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;color:#000}.c{text-align:center}.line{border-top:1px dashed #000;margin:4px 0}table{width:100%;border-collapse:collapse}td{font-size:11px;padding:1px 2px}</style>"
      + "</head><body onload=\"setTimeout(()=>window.print(),300)\">"
      + "<div class='c'><strong style='font-size:14px'>Shift Cash Report</strong><br/><span style='font-size:10px'>" + (s.employeeName || "") + "</span></div>"
      + "<div class='line'></div>"
      + "<div style='font-size:10px'>Opened: " + new Date(s.opened_at).toLocaleString("en-PH") + "<br/>Closed: " + new Date(s.closed_at).toLocaleString("en-PH") + "</div>"
      + "<div class='line'></div>"
      + "<table>"
      + "<tr><td>Opening Cash</td><td></td><td style='text-align:right'>" + "₱" + Number(s.opening_cash).toFixed(2) + "</td></tr>"
      + "<tr><td>Cash Sales</td><td></td><td style='text-align:right'>" + "₱" + Number(s.cash_sales).toFixed(2) + "</td></tr>"
      + "<tr><td>Cash Collections</td><td></td><td style='text-align:right'>" + "₱" + Number(s.cash_collections).toFixed(2) + "</td></tr>"
      + "<tr><td colspan='2'><strong>Expected Cash</strong></td><td style='text-align:right'><strong>" + "₱" + Number(s.expected_cash).toFixed(2) + "</strong></td></tr>"
      + "<tr><td colspan='2'><strong>Counted Cash</strong></td><td style='text-align:right'><strong>" + "₱" + Number(s.closing_cash).toFixed(2) + "</strong></td></tr>"
      + "<tr><td colspan='2'><strong>VARIANCE</strong></td><td style='text-align:right'><strong>" + (s.variance >= 0 ? "+" : "") + "₱" + Number(s.variance).toFixed(2) + "</strong></td></tr>"
      + "</table><div class='line'></div><table>"
      + "<tr><td>GCash Opening</td><td></td><td style='text-align:right'>" + "₱" + Number(s.opening_gcash).toFixed(2) + "</td></tr>"
      + "<tr><td>GCash Sales</td><td></td><td style='text-align:right'>" + "₱" + Number(s.gcash_sales).toFixed(2) + "</td></tr>"
      + "<tr><td>GCash Closing</td><td></td><td style='text-align:right'>" + "₱" + Number(s.closing_gcash).toFixed(2) + "</td></tr>"
      + "<tr><td colspan='2'><strong>Expected GCash</strong></td><td style='text-align:right'><strong>" + "₱" + (Number(s.opening_gcash) + Number(s.gcash_sales)).toFixed(2) + "</strong></td></tr>"
      + "</table><div class='line'></div>"
      + "<div class='c' style='font-size:10px'><strong>OPENING DENOMINATIONS</strong></div>"
      + "<table>" + denomRows(s.opening_denoms) + "</table>"
      + "<div class='line'></div>"
      + "<div class='c' style='font-size:10px'><strong>CLOSING DENOMINATIONS</strong></div>"
      + "<table>" + denomRows(s.closing_denoms) + "</table>"
      + "<div class='line'></div>"
      + (s.note ? "<div style='font-size:10px'>Note: " + s.note + "</div>" : "")
      + "<div class='c' style='font-size:10px;margin-top:8px'>" + "— End of Shift —" + "</div>"
      + "</body></html>"
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Shift Records</h2>
      <div className="flex gap-2">
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 bg-gold-100 border-amber-300/60 text-stone-800 h-9" />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 bg-gold-100 border-amber-300/60 text-stone-800 h-9" />
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2Icon className="h-8 w-8 animate-spin text-amber-600" /></div> : (
        <div className="space-y-3">
          {shifts.length === 0 && <p className="text-center text-stone-500 py-16">No shifts in this date range</p>}
          {shifts.map((s: any) => {
            const openCount = s.opening_denoms ? Object.values(s.opening_denoms).reduce((a: number, b: any) => a + Number(b), 0) : 0
            return (
              <Card key={s.id} className="bg-gold-200/90 border-amber-300/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={s.status === "open" ? "bg-green-600" : "bg-stone-600"}>{s.status === "open" ? "OPEN" : "CLOSED"}</Badge>
                      <span className="text-sm font-semibold text-amber-600">{s.employeeName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === "closed" && (
                        <Button variant="outline" size="sm" onClick={() => printShiftReport(s)} className="text-xs gap-1 h-7 px-2"><PrinterIcon className="h-3 w-3" /></Button>
                      )}
                      <span className="text-xs text-stone-500">
                        {new Date(s.opened_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {s.closed_at ? " " + "—" + " " + new Date(s.closed_at).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit" }) : " — now"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">Opening</p>
                      <p className="text-sm font-bold text-stone-800">{Number(s.opening_cash).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">Cash Sales</p>
                      <p className="text-sm font-bold text-amber-600">{Number(s.cash_sales).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">Collections</p>
                      <p className="text-sm font-bold text-amber-600">{Number(s.cash_collections).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">Expected</p>
                      <p className="text-sm font-bold text-blue-700">{Number(s.expected_cash).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    {s.status === "closed" && (
                      <>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-stone-500">Counted</p>
                          <p className="text-sm font-bold text-stone-800">{Number(s.closing_cash).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-stone-500">Variance</p>
                          <p className={"text-sm font-bold " + (Number(s.variance) >= 0 ? "text-green-700" : "text-red-600")}>
                            {(Number(s.variance) >= 0 ? "+" : "") + Number(s.variance).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <p className="text-stone-500">Balance</p>
                          <p className={"text-sm font-bold " + (Number(s.variance) === 0 ? "text-green-700" : Number(s.variance) > 50 || Number(s.variance) < -50 ? "text-red-600" : "text-yellow-600")}>
                            {Number(s.variance) === 0 ? "BALANCED" : (Number(s.variance) >= 0 ? "OVER" : "SHORT")}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs border-t border-amber-300/40 pt-3 mt-3">
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">GCash Opening</p>
                      <p className="text-sm font-bold text-stone-800">{Number(s.opening_gcash || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">GCash Sales</p>
                      <p className="text-sm font-bold text-blue-600">{Number(s.gcash_sales || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-stone-500">GCash Expected</p>
                      <p className="text-sm font-bold text-blue-700">{Number(s.expected_gcash || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                    </div>
                    {s.status === "closed" && (
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-stone-500">GCash Counted</p>
                        <p className="text-sm font-bold text-stone-800">{Number(s.closing_gcash || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, style: "currency", currency: "PHP" })}</p>
                      </div>
                    )}
                  </div>

                  {s.status === "open" && openCount > 0 && (
                    <div className="mt-2 text-xs text-stone-500">
                      Opened with {openCount} pieces across {Object.values(s.opening_denoms).filter((v: any) => Number(v) > 0).length} denominations
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
