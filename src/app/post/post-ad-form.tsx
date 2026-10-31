"use client";

import { onAuthStateChanged, type User } from "@firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { prepareUserForMarketplace } from "@/lib/firebase/prepare-user";
import { defaultCategories } from "@/lib/categories";

type CategoryOption = { id: string; name_en: string; name_bn: string };
type LocationOption = { id: string; name_en: string; name_bn: string };
const MAX_PHOTO_BYTES = 1_900_000;

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function optimizeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Your browser could not prepare that photo. Try a different image.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", quality);
      });
      if (!blob) throw new Error(`Could not prepare ${file.name} as a WebP image.`);
      if (blob.size <= MAX_PHOTO_BYTES) return blob;
      quality -= 0.14;
      canvas.width = Math.max(1, Math.round(canvas.width * 0.85));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.85));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    throw new Error(`${file.name} is too large to upload. Choose a smaller image.`);
  } finally {
    image.close();
  }
}

export default function PostAdForm() {
  const router = useRouter();
  const firebaseConfigured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (currentUser) => {
      if (!active) return;
      if (!currentUser) {
        router.replace("/login?next=%2Fpost");
        return;
      }

      setUser(currentUser);
      setLoading(true);
      setError("");
      try {
        await prepareUserForMarketplace(currentUser);
        const firestore = await import("@firebase/firestore");
        const db = await getFirebaseDb();
        const [categoryDocs, locationDocs] = await Promise.all([
          firestore.getDocs(firestore.collection(db, "categories")),
          firestore.getDocs(firestore.query(firestore.collection(db, "locations"), firestore.where("level", "==", "area"))),
        ]);
        const categoryOptions = categoryDocs.empty
          ? defaultCategories.map((category) => ({ id: category.slug, name_en: category.name, name_bn: category.bangla }))
          : categoryDocs.docs.map((category) => ({
            id: category.id,
            name_en: String(category.data().name_en ?? category.id),
            name_bn: String(category.data().name_bn ?? ""),
          }));
        if (active) {
          setCategories(categoryOptions);
          setLocations(locationDocs.docs.map((location) => ({
            id: location.id,
            name_en: String(location.data().name_en ?? location.id),
            name_bn: String(location.data().name_bn ?? ""),
          })));
        }
      } catch (caught) {
        if (active) setError(messageForError(caught));
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firebaseConfigured, router]);

  async function submitAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (files.length === 0) {
      setError("Add at least one photo so buyers can see what you are listing.");
      return;
    }
    if (files.length > 8) {
      setError("Choose up to eight photos.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    let adId: string | null = null;
    let firestore: typeof import("@firebase/firestore") | null = null;
    let db: import("@firebase/firestore").Firestore | null = null;
    const uploadedPaths: string[] = [];
    const getIdToken = () => user.getIdToken();

    try {
      firestore = await import("@firebase/firestore");
      db = await getFirebaseDb();
      const preparedImages: Blob[] = [];
      for (const file of files) preparedImages.push(await optimizeImage(file));
      const newAdId = crypto.randomUUID();
      const selectedCategory = categories.find((category) => category.id === String(formData.get("category_id") ?? ""));
      const selectedLocation = locations.find((location) => location.id === String(formData.get("location_id") ?? ""));
      if (!selectedCategory || !selectedLocation) throw new Error("Choose a valid category and neighborhood.");
      const adRef = firestore.doc(db, "ads", newAdId);
      await firestore.setDoc(adRef, {
        seller_id: user.uid,
        seller_display_name: user.displayName || user.email?.split("@")[0] || "Seller",
        category_id: selectedCategory.id,
        category_name_en: selectedCategory.name_en,
        location_id: selectedLocation.id,
        location_name_en: selectedLocation.name_en,
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        price: Number(formData.get("price")),
        negotiable: formData.get("negotiable") === "on",
        condition: String(formData.get("condition") ?? "used"),
        status: "draft",
        images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      adId = newAdId;

      const imageRows: { key: string; position: number; alt_text: string }[] = [];
      for (const [position, image] of preparedImages.entries()) {
        const imageId = crypto.randomUUID();
        const key = `${user.uid}/${newAdId}/${imageId}.webp`;
        const response = await fetch(`/api/listing-images/${key.split("/").map(encodeURIComponent).join("/")}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await getIdToken()}`,
            "Content-Type": "image/webp",
          },
          body: image,
        });
        if (!response.ok) {
          const result: unknown = await response.json();
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : `Could not upload ${files[position].name}.`;
          throw new Error(message);
        }
        uploadedPaths.push(key);
        imageRows.push({ key, position, alt_text: String(formData.get("title") ?? "").trim() });
      }

      await firestore.updateDoc(adRef, { images: imageRows, status: "pending", updated_at: new Date().toISOString() });

      form.reset();
      setFiles([]);
      setNotice("Your ad is in the review queue. It will become public only after a moderator approves it.");
    } catch (caught) {
      const details = [messageForError(caught)];
      if (adId && db && firestore) {
        const idToken = await getIdToken();
        const cleanupResults = await Promise.all(uploadedPaths.map(async (key) => {
          const response = await fetch(`/api/listing-images/${key.split("/").map(encodeURIComponent).join("/")}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (!response.ok) {
            const result: unknown = await response.json();
            return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
              ? result.error
              : `Could not remove ${key}.`;
          }
          return null;
        }));
        const cleanupError = cleanupResults.find((result): result is string => result !== null);
        if (cleanupError) {
          details.push(`Photo cleanup also failed: ${cleanupError}`);
        } else {
          await firestore.deleteDoc(firestore.doc(db, "ads", adId));
        }
        if (cleanupError) details.push("A private draft was retained; it was not sent for review.");
      }
      setError(details.join(" "));
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseConfigured) {
    return (
      <main className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Sign-in setup is not complete</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Connect Firebase and Cloudflare using the steps in the setup guide before posting a listing.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Sell on TurnOver</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Create your listing</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Add clear details and photos. Your ad stays private until a moderator reviews it.</p>
        </div>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Preparing your secure seller account…</section>
        ) : !user ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-slate-950">Sign in to post an ad</h2>
            <p className="mt-2 text-sm text-slate-600">Create your account with Google or a one-time email link, then return to your listing.</p>
            <a className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800" href="/login?next=%2Fpost">Sign in to continue</a>
          </section>
        ) : (
          <form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" onSubmit={submitAd}>
            {error && <p aria-live="assertive" className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</p>}
            {notice && <p aria-live="polite" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">{notice}</p>}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800" htmlFor="title">
                Ad title
                <input autoComplete="off" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="title" maxLength={120} minLength={5} name="title" placeholder="e.g. Gently used bicycle" required />
              </label>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="category_id">
                Category
                <select className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" defaultValue="" id="category_id" name="category_id" required>
                  <option disabled value="">Choose a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name_en} · {category.name_bn}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-800" htmlFor="description">
              Description
              <textarea className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal leading-6 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="description" maxLength={10000} minLength={20} name="description" placeholder="Describe the item's condition, key details, and anything a buyer should know." required />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800" htmlFor="price">
                Price (BDT)
                <input className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="price" min="0" name="price" placeholder="e.g. 2500" required step="0.01" type="number" />
              </label>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="location_id">
                Neighborhood
                <select className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" defaultValue="" id="location_id" name="location_id" required>
                  <option disabled value="">Choose your area</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name_en} · {location.name_bn}</option>)}
                </select>
                {locations.length === 0 && <span className="mt-1 block text-xs font-normal text-amber-800">No areas are available yet. Ask an administrator to add locations.</span>}
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Item condition</legend>
              <div className="mt-2 flex gap-3">
                <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm text-slate-700">
                  <input defaultChecked name="condition" type="radio" value="used" /> Used
                </label>
                <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm text-slate-700">
                  <input name="condition" type="radio" value="new" /> New
                </label>
              </div>
            </fieldset>

            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input className="size-4 accent-emerald-700" name="negotiable" type="checkbox" />
              The price is negotiable
            </label>

            <label className="block text-sm font-semibold text-slate-800" htmlFor="photos">
              Photos <span className="font-normal text-slate-500">(1–8 images, securely optimized before upload)</span>
              <input
                accept="image/*"
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal file:mr-3 file:min-h-8 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:text-sm file:font-semibold file:text-emerald-800"
                id="photos"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                required
                type="file"
              />
              {files.length > 0 && <span className="mt-2 block text-xs font-normal text-slate-500">{files.length} photo{files.length === 1 ? "" : "s"} selected</span>}
            </label>

            <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              Be honest about the item and meet buyers in a safe public place. Your listing remains private until it is approved.
            </div>
            <button className="min-h-12 w-full rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || categories.length === 0 || locations.length === 0} type="submit">
              {busy ? "Preparing and submitting your ad…" : "Submit for moderator review"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
