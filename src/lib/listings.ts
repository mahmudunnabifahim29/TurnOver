import "server-only";
import { categoryPresentationFor, defaultCategories, type MarketplaceCategory } from "./categories";

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

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

export async function getHomepageCategories(): Promise<MarketplaceCategory[]> {
  const categories = await getDocuments("categories");
  if (categories.length === 0) return defaultCategories;
  return categories.map(({ id, data }) => {
    const presentation = categoryPresentationFor(id, String(data.icon ?? "tag"));
    return {
      slug: id,
      name: String(data.name_en ?? id),
      bangla: String(data.name_bn ?? ""),
      ...presentation,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function decodeValue(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue !== undefined) return (value.arrayValue.values ?? []).map(decodeValue);
  if (value.mapValue !== undefined) {
    return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decodeValue(item)]));
  }
  return null;
}

function decodeDocument(document: FirestoreDocument): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function getFirestoreEndpoint(path: string): string | null {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  const documentPath = path === "documents:runQuery" ? path : `documents/${path}`;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/${documentPath}?key=${encodeURIComponent(apiKey)}`;
}

async function getDocuments(collection: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const endpoint = getFirestoreEndpoint(collection);
  if (!endpoint) return [];
  const url = new URL(endpoint);
  url.searchParams.set("pageSize", "1000");
  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok) {
    throw new Error(`Could not load ${collection} from Firestore (${response.status}). Check the Firestore database and rules.`);
  }
  const body: { documents?: FirestoreDocument[] } = await response.json();
  return (body.documents ?? []).map((document) => ({
    id: document.name.split("/").at(-1) ?? "",
    data: decodeDocument(document),
  }));
}

export async function getHomepageLocations(): Promise<HomepageLocation[]> {
  const locations = await getDocuments("locations");
  return locations
    .filter(({ data }) => data.level === "area")
    .map(({ id, data }) => ({
      id,
      name_en: String(data.name_en ?? ""),
      name_bn: String(data.name_bn ?? ""),
    }))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
}

export async function getHomepageListings(filters: {
  query?: string;
  category?: string;
  location?: string;
}): Promise<HomepageListing[]> {
  const endpoint = getFirestoreEndpoint("documents:runQuery");
  if (!endpoint) return [];
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "ads" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "EQUAL",
            value: { stringValue: "active" },
          },
        },
        orderBy: [{ field: { fieldPath: "created_at" }, direction: "DESCENDING" }],
        limit: 100,
      },
    }),
    next: { revalidate: 60 },
  });
  if (!response.ok) {
    throw new Error(`Could not load approved listings from Firestore (${response.status}). Check the Firestore database and rules.`);
  }
  const rows: Array<{ document?: FirestoreDocument }> = await response.json();
  const query = filters.query?.trim().toLocaleLowerCase().slice(0, 80);

  return rows
    .filter((row): row is { document: FirestoreDocument } => Boolean(row.document))
    .map(({ document }): Record<string, unknown> & { id: string } => ({
      id: document.name.split("/").at(-1) ?? "",
      ...decodeDocument(document),
    }))
    .filter((listing) =>
      (!query || String(listing.title ?? "").toLocaleLowerCase().includes(query)) &&
      (!filters.category || listing.category_id === filters.category) &&
      (!filters.location || listing.location_id === filters.location)
    )
    .slice(0, 24)
    .map((listing) => {
      const photo = Array.isArray(listing.images)
        ? listing.images
          .filter((image): image is Record<string, unknown> => typeof image === "object" && image !== null)
          .sort((a, b) => Number(a.position) - Number(b.position))[0]
        : undefined;
      if (!photo || typeof photo.key !== "string") {
        throw new Error(`Approved listing ${listing.id} is missing its required photo.`);
      }
      const photoPath = photo.key.split("/").map(encodeURIComponent).join("/");
      return {
        id: listing.id,
        title: String(listing.title ?? ""),
        price: Number(listing.price ?? 0),
        condition: String(listing.condition ?? "used"),
        created_at: String(listing.created_at ?? ""),
        category: String(listing.category_name_en ?? "Marketplace"),
        location: String(listing.location_name_en ?? "Bangladesh"),
        photoUrl: `/api/listing-images/${photoPath}`,
      };
    });
}
