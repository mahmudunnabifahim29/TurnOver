"use client";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getSupabaseEnv } from "./env";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, key } = getSupabaseEnv();
  browserClient = createSupabaseClient(url, key, {
    accessToken: async () => getFirebaseAuth().currentUser?.getIdToken() ?? null,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return browserClient;
}
