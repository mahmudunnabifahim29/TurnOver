"use client";

import { httpsCallable } from "@firebase/functions";
import type { User } from "@firebase/auth";
import { getFirebaseFunctions } from "./client";
import { createClient } from "@/lib/supabase/client";

export async function prepareUserForMarketplace(user: User): Promise<void> {
  const ensureRole = httpsCallable(getFirebaseFunctions(), "ensureSupabaseAuthenticatedRole");
  await ensureRole();
  await user.getIdToken(true);

  const { error } = await createClient().rpc("ensure_current_profile");
  if (error) {
    throw new Error(`Firebase sign-in worked, but marketplace setup failed: ${error.message}`);
  }
}
