import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const auth = getAuth();
const region = "asia-southeast1";
const ownerEmail = "mahmudunnabifahim3579@gmail.com";
const categories = [
  ["mobiles", "Mobiles", "মোবাইল"],
  ["electronics", "Electronics", "ইলেকট্রনিক্স"],
  ["vehicles", "Vehicles", "যানবাহন"],
  ["property", "Property", "প্রপার্টি"],
  ["home-living", "Home & Living", "ঘর ও গৃহস্থালি"],
  ["fashion", "Fashion", "ফ্যাশন"],
  ["furniture", "Furniture", "আসবাবপত্র"],
  ["jobs", "Jobs", "চাকরি"],
  ["services", "Services", "সেবা"],
  ["pets", "Pets", "পোষা প্রাণী"],
  ["sports-hobbies", "Sports & Hobbies", "খেলাধুলা ও শখ"],
  ["books-education", "Books & Education", "বই ও শিক্ষা"],
];
const areas = [
  ["dhaka", "Dhaka", "ঢাকা"],
  ["chattogram", "Chattogram", "চট্টগ্রাম"],
  ["khulna", "Khulna", "খুলনা"],
  ["rajshahi", "Rajshahi", "রাজশাহী"],
  ["sylhet", "Sylhet", "সিলেট"],
  ["barishal", "Barishal", "বরিশাল"],
  ["rangpur", "Rangpur", "রংপুর"],
  ["mymensingh", "Mymensingh", "ময়মনসিংহ"],
];

function requireSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before using your marketplace account.");
  }
  return request.auth;
}

function requireAdmin(request) {
  const caller = requireSignedIn(request);
  if (caller.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
  return caller;
}

async function seedCollection(collectionName, rows) {
  const collectionRef = db.collection(collectionName);
  const existing = await collectionRef.limit(1).get();
  if (!existing.empty) return;
  const batch = db.batch();
  for (const [id, name_en, name_bn] of rows) {
    const ref = collectionRef.doc(id);
    batch.set(ref, {
      name_en,
      name_bn,
      ...(collectionName === "locations" ? { level: "area", parent_id: null } : { slug: id, parent_id: null }),
    });
  }
  await batch.commit();
}

export const ensureMarketplaceProfile = onCall({ region, maxInstances: 10 }, async (request) => {
  const caller = requireSignedIn(request);
  if (caller.token.email_verified !== true || typeof caller.token.email !== "string") {
    throw new HttpsError("failed-precondition", "Verify your email address before creating a marketplace profile.");
  }

  const user = await auth.getUser(caller.uid);
  const profileRef = db.collection("users").doc(caller.uid);
  const existingProfile = await profileRef.get();
  const now = new Date().toISOString();
  await profileRef.set({
    email: user.email ?? caller.token.email,
    display_name: user.displayName ?? user.email?.split("@")[0] ?? "Marketplace user",
    role: user.customClaims?.role === "admin" || user.customClaims?.role === "moderator"
      ? user.customClaims.role
      : "user",
    updated_at: now,
    created_at: existingProfile.get("created_at") ?? now,
  }, { merge: true });

  await Promise.all([
    seedCollection("categories", categories),
    seedCollection("locations", areas),
  ]);
  return { profileReady: true };
});

export const bootstrapFirstAdmin = onCall({ region, maxInstances: 1 }, async (request) => {
  const caller = requireSignedIn(request);
  const user = await auth.getUser(caller.uid);
  if (
    caller.token.email_verified !== true ||
    user.email?.toLowerCase() !== ownerEmail
  ) {
    throw new HttpsError("permission-denied", "Only the verified marketplace owner can bootstrap administration.");
  }

  const profileRef = db.collection("users").doc(user.uid);
  const bootstrapRef = db.collection("system").doc("admin_bootstrap");
  await db.runTransaction(async (transaction) => {
    const bootstrap = await transaction.get(bootstrapRef);
    const bootstrapOwner = bootstrap.get("admin_uid");
    if (bootstrapOwner && bootstrapOwner !== user.uid) {
      throw new HttpsError("failed-precondition", "An administrator has already been set up.");
    }
    const admins = await transaction.get(db.collection("users").where("role", "==", "admin").limit(2));
    if (admins.docs.some((admin) => admin.id !== user.uid)) {
      throw new HttpsError("failed-precondition", "An administrator has already been set up.");
    }
    transaction.set(bootstrapRef, {
      admin_uid: user.uid,
      created_at: bootstrap.get("created_at") ?? new Date().toISOString(),
    }, { merge: true });
    transaction.set(profileRef, {
      email: user.email,
      display_name: user.displayName ?? user.email,
      role: "admin",
      updated_at: new Date().toISOString(),
    }, { merge: true });
  });

  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role: "admin" });
  return { role: "admin" };
});

export const adminListMarketplaceUsers = onCall({ region, maxInstances: 5 }, async (request) => {
  requireAdmin(request);
  const result = await auth.listUsers(1000);
  const profiles = await db.collection("users").get();
  const profileById = new Map(profiles.docs.map((profile) => [profile.id, profile.data()]));
  return result.users.map((user) => {
    const profile = profileById.get(user.uid);
    const role = user.customClaims?.role;
    return {
      user_id: user.uid,
      email: user.email ?? "",
      display_name: user.displayName ?? String(profile?.display_name ?? ""),
      role: role === "admin" || role === "moderator" ? role : "user",
    };
  });
});

export const setModeratorAccess = onCall(
  { region, maxInstances: 5 },
  async (request) => {
    requireAdmin(request);
    const targetUserId = request.data?.target_user_id;
    const enabled = request.data?.enabled;
    if (typeof targetUserId !== "string" || !targetUserId || typeof enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "Choose a user and whether moderator access should be enabled.");
    }

    const target = await auth.getUser(targetUserId);
    if (target.email?.toLowerCase() === ownerEmail || target.customClaims?.role === "admin") {
      throw new HttpsError("failed-precondition", "Administrator access cannot be changed here.");
    }
    const claims = { ...target.customClaims };
    if (enabled) claims.role = "moderator";
    else if (claims.role === "moderator") delete claims.role;

    await auth.setCustomUserClaims(target.uid, claims);
    await db.collection("users").doc(target.uid).set({
      email: target.email ?? "",
      display_name: target.displayName ?? target.email?.split("@")[0] ?? "Marketplace user",
      role: enabled ? "moderator" : "user",
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return { role: enabled ? "moderator" : "user" };
  },
);
