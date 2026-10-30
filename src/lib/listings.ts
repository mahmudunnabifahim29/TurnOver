import "server-only";
import { createClient } from "@supabase/supabase-js";

export type HomepageLocation = { id: string; name_en: string; name_bn: string };

export type HomepageListing = {
  id: string;
  title: string;
  price: number;
  condition: string;
  created_at: string;
  category: string;
  location: string;
  photoUrl: string;
};

function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT_REF") || key === "YOUR_PUBLISHABLE_KEY") return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getHomepageLocations(): Promise<HomepageLocation[]> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("locations")
    .select("id,name_en,name_bn")
    .eq("level", "area")
    .order("name_en");
  if (error) throw new Error(`Could not load marketplace locations: ${error.message}`);
  return data;
}

export async function getHomepageListings(filters: {
  query?: string;
  category?: string;
  location?: string;
}): Promise<HomepageListing[]> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return [];

  let categoryId: string | undefined;
  if (filters.category) {
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", filters.category.slice(0, 100))
      .maybeSingle();
    if (categoryError) throw new Error(`Could not find the selected category: ${categoryError.message}`);
    categoryId = category?.id ?? "00000000-0000-0000-0000-000000000000";
  }

  let request = supabase
    .from("ads")
    .select("id,title,price,condition,created_at,category:categories(name_en),location:locations(name_en),photos:ad_images(storage_path,position)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(24);

  const query = filters.query?.trim().slice(0, 80);
  if (query) {
    const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
    request = request.ilike("title", `%${escapedQuery}%`);
  }
  if (categoryId) request = request.eq("category_id", categoryId);
  if (filters.location && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.location)) {
    request = request.eq("location_id", filters.location);
  }

  const { data, error } = await request;
  if (error) throw new Error(`Could not load approved listings: ${error.message}`);

  return Promise.all((data ?? []).map(async (listing) => {
    const photo = [...(listing.photos ?? [])].sort((a, b) => a.position - b.position)[0];
    if (!photo) throw new Error(`Approved listing ${listing.id} is missing its required photo.`);
    const { data: signedPhoto, error: photoError } = await supabase.storage
      .from("ad-images")
      .createSignedUrl(photo.storage_path, 3600);
    if (photoError) throw new Error(`Could not load a listing photo: ${photoError.message}`);
    return {
      id: listing.id,
      title: listing.title,
      price: Number(listing.price),
      condition: listing.condition,
      created_at: listing.created_at,
      category: listing.category?.[0]?.name_en ?? "Marketplace",
      location: listing.location?.[0]?.name_en ?? "Bangladesh",
      photoUrl: signedPhoto.signedUrl,
    };
  }));
}
