export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT_REF") || key === "YOUR_PUBLISHABLE_KEY") {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and add your project URL and publishable key.");
  }
  return { url, key };
}
