import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseIdToken, type FirebaseIdentity } from "@/lib/firebase/verify-id-token";

export const runtime = "nodejs";

const maxImageBytes = 1_900_000;

type RouteContext = { params: Promise<{ key: string[] }> };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

async function getIdentity(request: NextRequest, required: boolean): Promise<FirebaseIdentity | null> {
  const token = getToken(request);
  if (!token) {
    if (required) throw new Error("Sign in before managing listing photos.");
    return null;
  }
  try {
    return await verifyFirebaseIdToken(token);
  } catch {
    throw new Error("Your sign-in has expired. Sign in again and retry.");
  }
}

function getListingKey(parts: string[]): { key: string; sellerId: string; adId: string } | null {
  const key = parts.join("/");
  const match = /^([A-Za-z0-9_-]{1,128})\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.webp)$/i.exec(key);
  if (!match) return null;
  return { key, sellerId: match[1], adId: match[2] };
}

async function getListing(request: NextRequest, adId: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Firebase is not configured for listing photo access.");

  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/ads/${encodeURIComponent(adId)}`,
  );
  url.searchParams.set("key", apiKey);
  const token = getToken(request);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Firestore listing lookup failed (${response.status}).`);
  const document = await response.json() as {
    fields?: {
      seller_id?: { stringValue?: string };
      status?: { stringValue?: string };
      images?: { arrayValue?: { values?: Array<{ mapValue?: { fields?: { key?: { stringValue?: string } } } }> } };
    };
  };
  return {
    sellerId: document.fields?.seller_id?.stringValue ?? "",
    status: document.fields?.status?.stringValue ?? "",
    imageKeys: (document.fields?.images?.arrayValue?.values ?? [])
      .map((image) => image.mapValue?.fields?.key?.stringValue)
      .filter((key): key is string => typeof key === "string"),
  };
}

async function getBucket(): Promise<CloudflareEnv["LISTING_IMAGES"]> {
  const { env } = await getCloudflareContext({ async: true });
  return env.LISTING_IMAGES;
}

async function readBoundedBody(request: NextRequest): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxImageBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new ArrayBuffer(total);
  const bytes = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const identity = await getIdentity(request, false);
    const path = getListingKey((await context.params).key);
    if (!path) return jsonError("Invalid listing photo path.", 400);
    const listing = await getListing(request, path.adId);
    if (!listing) return jsonError("Listing photo not found.", 404);
    if (path.sellerId !== listing.sellerId || !listing.imageKeys.includes(path.key)) {
      return jsonError("Listing photo not found.", 404);
    }
    const isOwner = identity?.sub === listing.sellerId && path.sellerId === listing.sellerId;
    const isStaff = identity?.role === "admin" || identity?.role === "moderator";
    if (listing.status !== "active" && !isOwner && !isStaff) {
      return jsonError("Listing photo not found.", 404);
    }

    const image = await (await getBucket()).get(path.key);
    if (!image) return jsonError("Listing photo not found.", 404);
    const headers = new Headers({
      "Content-Type": image.httpMetadata?.contentType ?? "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": listing.status === "active" ? "public, max-age=300" : "private, no-store",
    });
    if (image.httpEtag) headers.set("ETag", image.httpEtag);
    return new Response(image.body, { headers });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Sign in") || error.message.startsWith("Your sign-in"))) {
      return jsonError(error.message, 401);
    }
    console.error("Could not serve listing photo.", error);
    return jsonError("Could not load this listing photo.", 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const identity = await getIdentity(request, true);
    const path = getListingKey((await context.params).key);
    if (!path) return jsonError("Invalid listing photo path.", 400);
    if (!identity || identity.sub !== path.sellerId) return jsonError("You cannot upload photos for this account.", 403);
    const listing = await getListing(request, path.adId);
    if (!listing || listing.sellerId !== identity.sub || listing.status !== "draft") {
      return jsonError("Photos can only be uploaded to your private draft.", 403);
    }
    if (request.headers.get("content-type") !== "image/webp") return jsonError("Photos must be WebP images.", 415);
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && !/^\d+$/.test(contentLength)) {
      return jsonError("Invalid photo content length.", 400);
    }
    if (contentLength !== null && Number(contentLength) > maxImageBytes) {
      return jsonError("Photo exceeds the 1.9 MB limit.", 413);
    }
    const body = await readBoundedBody(request);
    if (body === null) return jsonError("Photo exceeds the 1.9 MB limit.", 413);
    if (body.byteLength === 0) {
      return jsonError("Photo is empty or exceeds the 1.9 MB limit.", 413);
    }
    const header = new Uint8Array(body, 0, Math.min(body.byteLength, 12));
    const isWebp = header.length >= 12 &&
      String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...header.slice(8, 12)) === "WEBP";
    if (!isWebp) return jsonError("The uploaded file is not a valid WebP image.", 415);

    await (await getBucket()).put(path.key, body, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { adId: path.adId, sellerId: identity.sub },
    });
    return NextResponse.json({ key: path.key }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Sign in") || error.message.startsWith("Your sign-in"))) {
      return jsonError(error.message, 401);
    }
    console.error("Could not upload listing photo.", error);
    return jsonError("Could not upload this listing photo.", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const identity = await getIdentity(request, true);
    const path = getListingKey((await context.params).key);
    if (!path) return jsonError("Invalid listing photo path.", 400);
    if (!identity) return jsonError("Sign in before removing listing photos.", 401);
    const listing = await getListing(request, path.adId);
    const isOwner = identity.sub === path.sellerId && listing?.sellerId === identity.sub;
    const isAdmin = identity.role === "admin";
    if (!listing || (!isAdmin && (!isOwner || !["draft", "pending"].includes(listing.status)))) {
      return jsonError("You cannot remove this listing photo.", 403);
    }
    await (await getBucket()).delete(path.key);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Sign in") || error.message.startsWith("Your sign-in"))) {
      return jsonError(error.message, 401);
    }
    console.error("Could not remove listing photo.", error);
    return jsonError("Could not remove this listing photo.", 500);
  }
}
