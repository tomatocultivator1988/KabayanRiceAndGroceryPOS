"use client"

import { useRouter, usePathname } from "next/navigation"
import { LogOutIcon, LayoutDashboardIcon } from "lucide-react"
import { adminNavLinks } from "@/lib/nav-links"

interface AdminShellProps {
  name: string
  children: React.ReactNode
}

export function AdminShell({ name, children }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/auth/login")
  }

  return (
    <div className="flex h-screen flex-col bg-transparent">
      <header className="relative z-10 flex items-center justify-between border-b border-amber-300/60 bg-gradient-to-r from-[#0D3B1E]/95 via-[#0D3B1E]/95 to-[#1B4D2E]/95 px-3 sm:px-4 py-3 text-white shrink-0 shadow-md">
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent animate-gold-shimmer bg-[length:200%_100%]" />
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-white/15 ring-1 ring-amber-400/20 overflow-hidden">
            <img src="/new logo.png" alt="Kabayan Mart" className="h-full w-full object-contain p-0.5" />
          </div>
          <div>
            <h1 className="hidden sm:block text-sm sm:text-base font-bold leading-tight tracking-tight truncate">Kabayan Mart</h1>
            <p className="hidden sm:block text-[0.6rem] sm:text-[0.7rem] font-medium text-stone-200 leading-tight">Admin Panel</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 flex-wrap justify-center">
          {adminNavLinks.map(link => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              title={link.hideLabel ? link.label : undefined}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all shrink-0 ${
                pathname.startsWith(link.href) && link.href !== "/pos" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "text-stone-300 hover:bg-primary/15 hover:text-stone-100"
              }`}
            >
              <link.icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline whitespace-nowrap">{link.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/25 px-2 sm:px-3 py-1">
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              {name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline text-xs sm:text-sm font-semibold text-stone-100 truncate max-w-[80px]">{name}</span>
          </div>

          <button onClick={handleLogout} className="rounded-full border border-primary/40 bg-primary/25 p-2 text-stone-200 hover:bg-red-500/30 hover:text-white transition-all" title="Logout">
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <nav className="relative z-10 flex flex-wrap gap-1.5 border-b-2 border-primary/20 bg-[#0D3B1E]/60 backdrop-blur-sm px-3 py-2 md:hidden">
        {adminNavLinks.map(link => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
              pathname.startsWith(link.href) && link.href !== "/pos" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "border-2 border-primary/20 text-stone-300 hover:bg-primary/15"
            }`}
          >
            {link.label}
          </button>
        ))}
      </nav>

      <div className="relative z-10 flex-1 overflow-y-auto [&>div>header]:hidden [&>div>nav.flex-wrap]:hidden">
        {children}
      </div>
    </div>
  )
}
