import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type FirebaseIdentity = JWTPayload & { sub: string; role?: string };

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseIdentity> {
  if (!projectId) throw new Error("Firebase project ID is not configured for server authentication.");
  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("The Firebase ID token does not contain a valid user ID.");
  }
  return payload as FirebaseIdentity;
}
