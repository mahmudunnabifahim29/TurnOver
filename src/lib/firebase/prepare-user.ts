"use client";

import { httpsCallable } from "@firebase/functions";
import type { User } from "@firebase/auth";
import { getFirebaseFunctions } from "./client";

export async function prepareUserForMarketplace(user: User): Promise<void> {
  if (!user.email || !user.emailVerified) {
    throw new Error("Verify your email address before creating a marketplace profile.");
  }
  const ensureProfile = httpsCallable(getFirebaseFunctions(), "ensureMarketplaceProfile");
  await ensureProfile();
}
