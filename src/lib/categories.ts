import "server-only";
import { createClient } from "@supabase/supabase-js";

export type MarketplaceCategory = {
  slug: string;
  name: string;
  bangla: string;
  icon: string;
  tone: string;
};

const categoryPresentation: Record<string, { icon: string; tone: string }> = {
  mobiles: { icon: "📱", tone: "bg-sky-50" },
  electronics: { icon: "🎧", tone: "bg-violet-50" },
  vehicles: { icon: "🚗", tone: "bg-orange-50" },
  property: { icon: "🏠", tone: "bg-emerald-50" },
  "home-living": { icon: "🪴", tone: "bg-lime-50" },
  fashion: { icon: "👕", tone: "bg-pink-50" },
  furniture: { icon: "🛋️", tone: "bg-amber-50" },
  jobs: { icon: "💼", tone: "bg-blue-50" },
  services: { icon: "🧰", tone: "bg-teal-50" },
  pets: { icon: "🐈", tone: "bg-rose-50" },
  "sports-hobbies": { icon: "⚽", tone: "bg-green-50" },
  "books-education": { icon: "📚", tone: "bg-indigo-50" },
};

const iconByKey: Record<string, string> = {
  smartphone: "📱",
  monitor: "🎧",
  car: "🚗",
  building: "🏠",
  house: "🪴",
  shirt: "👕",
  armchair: "🛋️",
  briefcase: "💼",
  wrench: "🧰",
  "paw-print": "🐈",
  bike: "⚽",
  "book-open": "📚",
};

const defaultCategories: MarketplaceCategory[] = [
  { slug: "mobiles", name: "Mobiles", bangla: "মোবাইল", ...categoryPresentation.mobiles },
  { slug: "electronics", name: "Electronics", bangla: "ইলেকট্রনিক্স", ...categoryPresentation.electronics },
  { slug: "vehicles", name: "Vehicles", bangla: "যানবাহন", ...categoryPresentation.vehicles },
  { slug: "property", name: "Property", bangla: "প্রপার্টি", ...categoryPresentation.property },
  { slug: "home-living", name: "Home & Living", bangla: "ঘর ও গৃহস্থালি", ...categoryPresentation["home-living"] },
  { slug: "fashion", name: "Fashion", bangla: "ফ্যাশন", ...categoryPresentation.fashion },
  { slug: "furniture", name: "Furniture", bangla: "আসবাবপত্র", ...categoryPresentation.furniture },
  { slug: "jobs", name: "Jobs", bangla: "চাকরি", ...categoryPresentation.jobs },
  { slug: "services", name: "Services", bangla: "সেবা", ...categoryPresentation.services },
  { slug: "pets", name: "Pets", bangla: "পোষা প্রাণী", ...categoryPresentation.pets },
  { slug: "sports-hobbies", name: "Sports & Hobbies", bangla: "খেলাধুলা ও শখ", ...categoryPresentation["sports-hobbies"] },
  { slug: "books-education", name: "Books & Education", bangla: "বই ও শিক্ষা", ...categoryPresentation["books-education"] },
];

export async function getHomepageCategories(): Promise<MarketplaceCategory[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT_REF") || key === "YOUR_PUBLISHABLE_KEY") {
    return defaultCategories;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("categories")
    .select("slug,name_en,name_bn,icon")
    .is("parent_id", null)
    .order("sort_order")
    .order("name_en");
  if (error) throw new Error(`Could not load marketplace categories: ${error.message}`);
  return data.map((category) => ({
    slug: category.slug,
    name: category.name_en,
    bangla: category.name_bn,
    icon: categoryPresentation[category.slug]?.icon ?? iconByKey[category.icon] ?? "🏷️",
    tone: categoryPresentation[category.slug]?.tone ?? "bg-emerald-50",
  }));
}
