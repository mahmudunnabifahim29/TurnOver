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

export const defaultCategories: MarketplaceCategory[] = [
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

export function categoryPresentationFor(slug: string, icon = "tag") {
  return {
    icon: categoryPresentation[slug]?.icon ?? iconByKey[icon] ?? "🏷️",
    tone: categoryPresentation[slug]?.tone ?? "bg-emerald-50",
  };
}
