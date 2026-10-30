import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) initializeApp();

export const ensureSupabaseAuthenticatedRole = onCall(
  { region: "asia-southeast1", maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before connecting your marketplace account.");
    }

    const auth = getAuth();
    const user = await auth.getUser(request.auth.uid);
    if (user.customClaims?.role !== "authenticated") {
      await auth.setCustomUserClaims(user.uid, {
        ...user.customClaims,
        role: "authenticated",
      });
    }
    return { connected: true };
  },
);
