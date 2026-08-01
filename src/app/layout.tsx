import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"
import { cn } from "@/lib/utils/cn"
import "./globals.css"
import "./rices-bg.css"

import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })

export const viewport: Viewport = {
  themeColor: "#0D3B1E",
}

export const metadata: Metadata = {
  title: "Kabayan Mart",
  description: "Retail and wholesale POS for rice and grocery",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kabayan Mart" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans antialiased", inter.variable)}>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen text-foreground">
        <div className="rices-bg min-h-screen">
          {children}
        </div>
        <Toaster closeButton position="top-right"
          toastOptions={{
            className: "!border !border-amber-300/60 !shadow !shadow-black/5 !text-stone-800",
            style: { background: "#F8F8F8", borderColor: "rgba(212, 175, 55, 0.25)" },
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        ` }} />
      </body>
    </html>
  )
}
