import type { Metadata } from "next";
import Link from "next/link";
import AccountControls from "@/components/account-controls";
import "./globals.css";

export const metadata: Metadata = {
  title: "TurnOver — Good finds in Bangladesh",
  description: "Discover great local finds or list something for sale on TurnOver, Bangladesh's friendly marketplace.",
  robots: { index: false, follow: false }, // Remove when ready for production in Phase 9.
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link aria-label="TurnOver home" className="flex shrink-0 items-center gap-2.5" href="/">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-emerald-700 text-white">
                <svg fill="none" height="23" viewBox="0 0 24 24" width="23">
                  <path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
                  <path d="M9 20v-6h6v6M8 10h8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </span>
              <span>
                <span className="block text-lg font-extrabold leading-5 tracking-tight text-slate-950">Turn<span className="text-emerald-700">Over</span></span>
                <span className="hidden text-[10px] font-medium tracking-wide text-slate-500 sm:block">বাংলাদেশ · buy & sell local</span>
              </span>
            </Link>

            <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
              <Link className="text-sm font-medium text-slate-600 transition hover:text-emerald-800" href="/#categories-heading">Categories</Link>
              <Link className="text-sm font-medium text-slate-600 transition hover:text-emerald-800" href="/#featured-heading">Featured</Link>
              <Link className="text-sm font-medium text-slate-600 transition hover:text-emerald-800" href="/#latest">Latest ads</Link>
            </nav>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <span aria-label="English interface" className="hidden items-center gap-1 text-xs font-semibold sm:inline-flex">
                <span className="text-emerald-800">EN</span><span className="text-slate-300">/</span><span className="text-slate-500">বাংলা</span>
              </span>
              <AccountControls />
              <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3.5 text-sm font-bold text-white transition hover:bg-emerald-800 sm:min-h-11 sm:px-5" href="/post">
                <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
                <span>Post an ad</span>
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 px-4 py-2.5 md:hidden">
            <form action="/" className="mx-auto flex max-w-7xl items-center gap-2 rounded-xl bg-slate-100 px-3">
              <svg aria-hidden="true" className="shrink-0 text-slate-500" fill="none" height="18" viewBox="0 0 24 24" width="18">
                <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
              <label className="sr-only" htmlFor="mobile-search">Search ads</label>
              <input autoComplete="off" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" id="mobile-search" name="q" placeholder="Search mobiles, furniture, more..." />
              <button aria-label="Search" className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white" type="submit">
                <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                  <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </form>
          </div>
        </header>
        <div id="top">{children}</div>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8 lg:py-14">
            <div>
              <Link className="text-xl font-extrabold tracking-tight text-slate-950" href="/">Turn<span className="text-emerald-700">Over</span></Link>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">Good finds, good people. Making it easier to buy and sell, wherever you are in Bangladesh.</p>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Explore</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-500">
                <li>                <Link className="hover:text-emerald-800" href="/#categories-heading">All categories</Link></li>
                <li><Link className="hover:text-emerald-800" href="/#featured-heading">Featured ads</Link></li>
                <li><Link className="hover:text-emerald-800" href="/#latest">Latest listings</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">For sellers</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-500">
                <li><Link className="hover:text-emerald-800" href="/post">Post an ad</Link></li>
                <li><Link className="hover:text-emerald-800" href="/post">Selling safely</Link></li>
                <li><Link className="hover:text-emerald-800" href="/#sell">Help & support</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">A safer marketplace</h2>
              <p className="mt-4 text-sm leading-6 text-slate-500">Meet in a public place. Check your item before you pay. Never share your one-time password.</p>
            </div>
          </div>
          <div className="border-t border-slate-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span>© {new Date().getFullYear()} TurnOver. Built for Bangladesh.</span>
              <span>Buy local. Sell with confidence.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
