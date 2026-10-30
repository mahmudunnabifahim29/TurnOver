import Link from "next/link";
import { cookies } from "next/headers";
import { getHomepageCategories } from "@/lib/categories";
import { getHomepageListings, getHomepageLocations } from "@/lib/listings";
import { formatBDT } from "@/lib/format";
import type { Locale } from "@/components/locale-switcher";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; location?: string }>;
}) {
  const filters = await searchParams;
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get("turnover-locale")?.value === "bn" ? "bn" : "en";
  const copy = locale === "bn" ? {
    tagline: "আপনার এলাকার কেনাবেচার বাজার",
    headline: <>ভালো পছন্দ। <span className="text-emerald-700">ভালো মানুষ।</span></>,
    intro: "বাংলাদেশজুড়ে আপনার পছন্দের জিনিস কিনুন ও বিক্রি করুন। নতুন কিছু খুঁজে পাওয়ার সহজ উপায়।",
    search: "কী খুঁজছেন?",
    allCategories: "সব বিভাগ",
    allLocations: "সারা বাংলাদেশ",
    searchButton: "খুঁজুন",
    trending: "জনপ্রিয়:",
    local: "আপনার আরও কাছে",
    thoughtful: "আরও আন্তরিক।",
    browse: "বিভাগ অনুযায়ী দেখুন",
    nearby: "আপনার কাছেই পেয়ে যান",
    featuredEyebrow: "আপনার জন্য বাছাই করা",
    featured: "বিশেষ বিজ্ঞাপন",
    noFeatured: "এখনো কোনো বিশেষ বিজ্ঞাপন নেই",
    featuredEmpty: "যাচাই ও অনুমোদনের পর বিশেষ বিজ্ঞাপন এখানে দেখা যাবে।",
    fresh: "বাজারে নতুন",
    latest: "সাম্প্রতিক বিজ্ঞাপন",
    yourSearch: "আপনার অনুসন্ধান",
    matching: "মিলে যাওয়া বিজ্ঞাপন",
    noMatch: "এই অনুসন্ধানে কোনো বিজ্ঞাপন নেই",
    gettingStarted: "বাজারটি এখনই শুরু হচ্ছে",
    approvedOnly: "অনুমোদিত বিজ্ঞাপন যাচাইয়ের পর এখানে দেখা যাবে। অন্যভাবে খুঁজুন, অথবা প্রথম বিজ্ঞাপনটি দিন।",
    clear: "অনুসন্ধান মুছুন",
    sell: "কিছু বিক্রি করতে চান?",
    buyerNearby: "আপনার পরের ক্রেতা কাছেই।",
    createListing: "বিজ্ঞাপন দিন এবং কাউকে তার প্রয়োজনীয় জিনিসটি খুঁজে পেতে সাহায্য করুন।",
    post: "বিজ্ঞাপন দিন",
    photo: "ছবি",
  } : {
    tagline: "Your neighborhood marketplace",
    headline: <>Good finds. <span className="text-emerald-700">Good people.</span></>,
    intro: "Buy and sell the things you love, right here in Bangladesh. A simpler way to find your next favorite thing.",
    search: "What are you looking for?",
    allCategories: "All categories",
    allLocations: "All Bangladesh",
    searchButton: "Search",
    trending: "Trending:",
    local: "A little more local",
    thoughtful: "A lot more thoughtful.",
    browse: "Browse by category",
    nearby: "A good find is just around the corner",
    featuredEyebrow: "Handpicked for you",
    featured: "Featured finds",
    noFeatured: "No featured listings yet",
    featuredEmpty: "Featured listings will appear here after they have been reviewed and approved.",
    fresh: "Fresh on the market",
    latest: "Latest listings",
    yourSearch: "Your search",
    matching: "Matching listings",
    noMatch: "No listings match that search yet",
    gettingStarted: "The marketplace is just getting started",
    approvedOnly: "Approved listings appear here after review. Try another search, or be the first to share a great local find.",
    clear: "Clear search",
    sell: "Have something to sell?",
    buyerNearby: "Your next buyer is nearby.",
    createListing: "Create a listing and help someone find exactly what they need.",
    post: "Post an ad",
    photo: "Photo",
  };
  const query = filters.q?.trim() ?? "";
  const selectedCategory = filters.category ?? "";
  const selectedLocation = filters.location ?? "";
  const [listings, locations, categories] = await Promise.all([
    getHomepageListings({ query, category: selectedCategory, location: selectedLocation }),
    getHomepageLocations(),
    getHomepageCategories(),
  ]);
  return (
    <main>
      <section className="overflow-hidden bg-[#f2f7f3]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-900">
              <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
              {copy.tagline}
            </span>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.1] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              {copy.headline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              {copy.intro}
            </p>

            <form action="/" className="mt-8 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-emerald-950/5 sm:p-2">
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
                <label className="flex min-h-12 items-center gap-3 rounded-xl px-3 focus-within:ring-2 focus-within:ring-emerald-600">
                  <svg aria-hidden="true" className="shrink-0 text-emerald-800" fill="none" height="20" viewBox="0 0 24 24" width="20">
                    <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                  </svg>
                  <span className="sr-only">{copy.search}</span>
                  <input className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400" defaultValue={query} name="q" placeholder={copy.search} />
                </label>
                <label className="flex min-h-12 items-center gap-2 border-t border-slate-100 px-3 sm:border-l sm:border-t-0">
                  <span aria-hidden="true" className="text-emerald-800">▦</span>
                  <span className="sr-only">Choose a category</span>
                  <select className="w-full appearance-none bg-transparent text-sm text-slate-600 outline-none" defaultValue={selectedCategory} name="category">
                    <option value="">{copy.allCategories}</option>
                    {categories.map((category) => <option key={category.slug} value={category.slug}>{locale === "bn" ? category.bangla : category.name}</option>)}
                  </select>
                </label>
                <label className="flex min-h-12 items-center gap-2 border-t border-slate-100 px-3 sm:border-l sm:border-t-0">
                  <svg aria-hidden="true" className="shrink-0 text-emerald-800" fill="none" height="18" viewBox="0 0 24 24" width="18">
                    <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <span className="sr-only">Choose a location</span>
                  <select className="w-full appearance-none bg-transparent text-sm text-slate-600 outline-none" defaultValue={selectedLocation} name="location">
                    <option value="">{copy.allLocations}</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{locale === "bn" ? location.name_bn : location.name_en}</option>)}
                  </select>
                </label>
                <button className="min-h-12 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline-white" type="submit">
                  {copy.searchButton}
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">{copy.trending}</span>
              <Link className="rounded-full bg-white/80 px-3 py-1.5 hover:text-emerald-800" href="/?q=iPhone#latest">iPhone</Link>
              <Link className="rounded-full bg-white/80 px-3 py-1.5 hover:text-emerald-800" href="/?q=Apartments#latest">Apartments</Link>
              <Link className="rounded-full bg-white/80 px-3 py-1.5 hover:text-emerald-800" href="/?q=Motorbikes#latest">Motorbikes</Link>
            </div>
          </div>

          <div aria-hidden="true" className="relative mx-auto hidden h-[350px] w-full max-w-[500px] items-center justify-center lg:flex">
            <div className="absolute inset-8 rotate-[-5deg] rounded-[2.5rem] bg-[#deebe1]" />
            <div className="absolute right-10 top-4 size-20 rounded-3xl bg-amber-200/80" />
            <div className="absolute bottom-8 left-4 size-24 rounded-full bg-emerald-200/70" />
            <div className="relative grid size-64 place-items-center rounded-[3rem] bg-white shadow-2xl shadow-emerald-950/10">
              <span className="text-[9rem]">🛍️</span>
            </div>
            <div className="absolute left-2 top-14 rounded-2xl bg-white px-4 py-3 shadow-lg">
              <span className="text-sm font-bold text-slate-900">{copy.local}</span>
              <p className="mt-1 text-xs text-slate-500">{copy.thoughtful}</p>
            </div>
            <div className="absolute bottom-8 right-1 rounded-2xl bg-white px-4 py-3 shadow-lg">
              <span className="text-xl">🤝</span>
              <span className="ml-2 text-sm font-semibold text-slate-800">{locale === "bn" ? "কিনুন। বিক্রি করুন। হাসুন।" : "Buy. Sell. Smile."}</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{locale === "bn" ? "ঘুরে দেখুন" : "Explore"}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl" id="categories-heading">{copy.browse}</h2>
          </div>
          <span className="mb-1 hidden text-sm text-slate-500 sm:block">{copy.nearby}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {categories.map((category) => (
            <Link className="group flex min-h-28 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md sm:min-h-32 sm:flex-col sm:items-start sm:justify-between sm:p-4" href={`/?category=${encodeURIComponent(category.slug)}#latest`} key={category.name}>
              <span aria-hidden="true" className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${category.tone}`}>{category.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-slate-900 group-hover:text-emerald-800">{locale === "bn" ? category.bangla : category.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{category.bangla}</span>
              </span>
              <span aria-hidden="true" className="ml-auto hidden text-slate-400 group-hover:text-emerald-700 sm:block">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{copy.featuredEyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl" id="featured-heading">{copy.featured}</h2>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center sm:py-14">
            <span aria-hidden="true" className="text-4xl">✦</span>
            <h3 className="mt-3 font-semibold text-slate-900">{copy.noFeatured}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{copy.featuredEmpty}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="latest-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8" id="latest">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{query || selectedCategory || selectedLocation ? copy.yourSearch : copy.fresh}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl" id="latest-heading">{query || selectedCategory || selectedLocation ? copy.matching : copy.latest}</h2>
        </div>
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center sm:py-14">
            <span aria-hidden="true" className="text-4xl">⌂</span>
            <h3 className="mt-3 font-semibold text-slate-900">{query || selectedCategory || selectedLocation ? copy.noMatch : copy.gettingStarted}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{copy.approvedOnly}</p>
            {(query || selectedCategory || selectedLocation) && <Link className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-800 hover:text-emerald-950" href="/#latest">{copy.clear}</Link>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg" key={listing.id}>
                <div
                  aria-label={`${copy.photo} of ${listing.title}`}
                  className="aspect-[4/3] bg-slate-100 bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url("${listing.photoUrl}")` }}
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-2 font-semibold leading-5 text-slate-900">{listing.title}</h3>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-emerald-800">{listing.condition}</span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-emerald-800">{formatBDT(listing.price)}</p>
                  <p className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="truncate">{listing.category} · {listing.location}</span>
                    <span className="shrink-0">{new Intl.DateTimeFormat("en-BD", { dateStyle: "medium" }).format(new Date(listing.created_at))}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8" id="sell">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl bg-emerald-800 px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10 sm:py-10">
          <div>
            <p className="text-sm font-semibold text-emerald-200">{copy.sell}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{copy.buyerNearby}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100">{copy.createListing}</p>
          </div>
          <a className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-amber-300 px-6 text-sm font-bold text-emerald-950 transition hover:bg-amber-200" href="/post">
            {copy.post} <span aria-hidden="true" className="ml-2">→</span>
          </a>
        </div>
      </section>
    </main>
  );
}
