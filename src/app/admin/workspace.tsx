"use client";

import { getIdTokenResult, onAuthStateChanged, type User } from "@firebase/auth";
import { httpsCallable } from "@firebase/functions";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatBDT } from "@/lib/format";
import { getFirebaseAuth, getFirebaseDb, getFirebaseFunctions, isFirebaseConfigured } from "@/lib/firebase/client";
import { prepareUserForMarketplace } from "@/lib/firebase/prepare-user";

type Role = "admin" | "moderator";
type Tab = "overview" | "ads" | "products" | "categories" | "issues" | "reports" | "users";

type AdRow = {
  id: string;
  title: string;
  description?: string;
  status: string;
  price: number;
  condition: string;
  created_at: string;
  images?: { key: string; position: number }[] | null;
  photoUrl?: string | null;
  category: { name_en: string }[] | null;
  location: { name_en: string }[] | null;
  seller: { display_name: string }[] | null;
};

type IssueRow = {
  id: string;
  title: string;
  details: string;
  page_path: string;
  severity: string;
  status: string;
  created_at: string;
};

type ReportRow = {
  id: string;
  reason: string;
  details: string;
  resolved: boolean;
  created_at: string;
  ad: { title: string }[] | null;
};

type UserRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
};

type CategoryRow = {
  id: string;
  slug: string;
  name_en: string;
  name_bn: string;
  parent_id: string | null;
};

type Counts = { pendingAds: number; activeAds: number; openIssues: number; openReports: number };
type FirestoreRow = Record<string, unknown>;

const dateFormatter = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" });
const ownerEmail = "mahmudunnabifahim3579@gmail.com";

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function toAdRow(id: string, value: FirestoreRow): AdRow {
  const images = Array.isArray(value.images)
    ? value.images.filter((image): image is { key: string; position: number } =>
      typeof image === "object" && image !== null &&
      "key" in image && typeof image.key === "string" &&
      "position" in image && typeof image.position === "number")
    : [];
  return {
    id,
    title: String(value.title ?? ""),
    description: String(value.description ?? ""),
    status: String(value.status ?? "draft"),
    price: Number(value.price ?? 0),
    condition: String(value.condition ?? "used"),
    created_at: String(value.created_at ?? new Date(0).toISOString()),
    images,
    category: [{ name_en: String(value.category_name_en ?? "Marketplace") }],
    location: [{ name_en: String(value.location_name_en ?? "Bangladesh") }],
    seller: [{ display_name: String(value.seller_display_name ?? "Seller") }],
  };
}

function listingImageUrl(key: string): string {
  return `/api/listing-images/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function StaffListingPhoto({ url, title }: { url: string; title: string }) {
  const [source, setSource] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    async function loadPhoto() {
      try {
        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser) throw new Error("Sign in to view this private listing photo.");
        const token = await currentUser.getIdToken();
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Could not load listing photo (${response.status}).`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSource(objectUrl);
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setLoadError(caught instanceof Error ? caught.message : "Could not load listing photo.");
        }
      }
    }
    void loadPhoto();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:w-44">
      {source
        ? <Image alt={`Photo of ${title}`} className="h-full w-full object-cover" height={300} src={source} unoptimized width={400} />
        : <span className="px-3 text-center text-xs text-slate-500">{loadError || "Loading private photo…"}</span>}
    </div>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Panel>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </Panel>
  );
}

export default function AdminWorkspace({
  initialTab = "overview",
  workspacePath = "/admin",
  requiredRole = "admin",
}: {
  initialTab?: Tab;
  workspacePath?: string;
  requiredRole?: Role;
}) {
  const router = useRouter();
  const firebaseConfigured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [products, setProducts] = useState<AdRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ pendingAds: 0, activeAds: 0, openIssues: 0, openReports: 0 });
  const [connectedAt, setConnectedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (currentRole: Role) => {
    setError("");
    const firestore = await import("@firebase/firestore");
    const db = await getFirebaseDb();
    const [adsResult, issuesResult, pendingCount, activeCount, issueCount] = await Promise.all([
      firestore.getDocs(firestore.query(firestore.collection(db, "ads"), firestore.where("status", "==", "pending"), firestore.limit(50))),
      firestore.getDocs(firestore.query(firestore.collection(db, "site_issues"), firestore.limit(50))),
      firestore.getCountFromServer(firestore.query(firestore.collection(db, "ads"), firestore.where("status", "==", "pending"))),
      firestore.getCountFromServer(firestore.query(firestore.collection(db, "ads"), firestore.where("status", "==", "active"))),
      firestore.getCountFromServer(firestore.query(firestore.collection(db, "site_issues"), firestore.where("status", "!=", "resolved"))),
    ]);
    const adsWithPhotos = adsResult.docs.map((snapshot) => {
      const ad = toAdRow(snapshot.id, snapshot.data());
      const firstImage = [...(ad.images ?? [])].sort((a, b) => a.position - b.position)[0];
      if (!firstImage) throw new Error(`Pending listing "${ad.title}" has no photo to review.`);
      ad.photoUrl = listingImageUrl(firstImage.key);
      return ad;
    }).sort((a, b) => a.created_at.localeCompare(b.created_at));
    setAds(adsWithPhotos);
    setIssues(issuesResult.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as IssueRow)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setCounts({
      pendingAds: pendingCount.data().count,
      activeAds: activeCount.data().count,
      openIssues: issueCount.data().count,
      openReports: 0,
    });

    if (currentRole === "admin") {
      const listUsers = httpsCallable<void, UserRow[]>(getFirebaseFunctions(), "adminListMarketplaceUsers");
      const [reportResult, reportCount, userResult, productResult, categoryResult] = await Promise.all([
        firestore.getDocs(firestore.query(firestore.collection(db, "reports"), firestore.where("resolved", "==", false), firestore.limit(50))),
        firestore.getCountFromServer(firestore.query(firestore.collection(db, "reports"), firestore.where("resolved", "==", false))),
        listUsers(),
        firestore.getDocs(firestore.query(firestore.collection(db, "ads"), firestore.limit(100))),
        firestore.getDocs(firestore.query(firestore.collection(db, "categories"), firestore.limit(100))),
      ]);
      setReports(reportResult.docs.map((snapshot) => {
        const value = snapshot.data();
        return {
          id: snapshot.id,
          reason: String(value.reason ?? ""),
          details: String(value.details ?? ""),
          resolved: Boolean(value.resolved),
          created_at: String(value.created_at ?? ""),
          ad: [{ title: String(value.ad_title ?? "Listing") }],
        };
      }).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setUsers(userResult.data);
      setProducts(productResult.docs.map((snapshot) => toAdRow(snapshot.id, snapshot.data())));
      setCategories(categoryResult.docs.map((snapshot) => {
        const value = snapshot.data();
        return {
          id: snapshot.id,
          slug: snapshot.id,
          name_en: String(value.name_en ?? snapshot.id),
          name_bn: String(value.name_bn ?? ""),
          parent_id: typeof value.parent_id === "string" ? value.parent_id : null,
        };
      }));
      setCounts((current) => ({ ...current, openReports: reportCount.data().count }));
    } else {
      setReports([]);
      setUsers([]);
      setProducts([]);
      setCategories([]);
    }
    setConnectedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (currentUser) => {
      if (!active) return;
      if (!currentUser) {
        router.replace(`/login?next=${encodeURIComponent(workspacePath)}`);
        return;
      }
      setUser(currentUser);
      setLoading(true);
      setAccessDenied(false);
      setError("");
      try {
        await prepareUserForMarketplace(currentUser);
        const token = await getIdTokenResult(currentUser, true);
        const currentRole = token.claims.role;
        if (currentRole !== "admin" && currentRole !== "moderator") {
          setRole(null);
          setAccessDenied(true);
          return;
        }
        if (currentRole !== requiredRole) {
          setRole(null);
          setAccessDenied(true);
          return;
        }
        setRole(currentRole);
        await loadWorkspace(currentRole);
      } catch (caught) {
        setError(messageForError(caught));
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firebaseConfigured, loadWorkspace, requiredRole, router, workspacePath]);

  async function refresh() {
    if (!role) return;
    setLoading(true);
    try {
      await loadWorkspace(role);
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapFirstAdmin() {
    if (!user || user.email?.toLowerCase() !== ownerEmail) return;
    setBootstrapping(true);
    setError("");
    try {
      const bootstrap = httpsCallable<void, { role: string }>(getFirebaseFunctions(), "bootstrapFirstAdmin");
      await bootstrap();
      await user.getIdToken(true);
      setRole("admin");
      setAccessDenied(false);
      await loadWorkspace("admin");
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBootstrapping(false);
    }
  }

  async function moderateAd(adId: string, status: "active" | "rejected") {
    setBusyId(adId);
    setNotice("");
    setError("");
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.runTransaction(db, async (transaction) => {
        const adRef = firestore.doc(db, "ads", adId);
        const ad = await transaction.get(adRef);
        if (!ad.exists() || ad.data().status !== "pending") {
          throw new Error("This listing was already reviewed. Refresh the queue and try again.");
        }
        transaction.update(adRef, { status, updated_at: new Date().toISOString() });
      });
      setNotice(status === "active" ? "Listing approved and published." : "Listing rejected and kept private.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function updateIssue(issueId: string, status: "in_progress" | "resolved") {
    setBusyId(issueId);
    setNotice("");
    setError("");
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.updateDoc(firestore.doc(db, "site_issues", issueId), { status, updated_at: new Date().toISOString() });
      setNotice("Issue status updated.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusyId("new-issue");
    setNotice("");
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.addDoc(firestore.collection(db, "site_issues"), {
        reporter_id: user.uid,
        title: String(formData.get("title") ?? "").trim(),
        details: String(formData.get("details") ?? "").trim(),
        page_path: String(formData.get("page_path") ?? "/").trim() || "/",
        severity: String(formData.get("severity") ?? "medium"),
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      form.reset();
      setNotice("Bug finding submitted to the operations team.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function resolveReport(reportId: string) {
    setBusyId(reportId);
    setError("");
    setNotice("");
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.runTransaction(db, async (transaction) => {
        const reportRef = firestore.doc(db, "reports", reportId);
        const report = await transaction.get(reportRef);
        if (!report.exists() || report.data().resolved) throw new Error("This report has already been handled.");
        transaction.update(reportRef, { resolved: true, updated_at: new Date().toISOString() });
      });
      setNotice("Report marked as reviewed.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function toggleModerator(targetUser: UserRow) {
    setBusyId(targetUser.user_id);
    setError("");
    setNotice("");
    try {
      const setModeratorAccess = httpsCallable<
        { target_user_id: string; enabled: boolean },
        { role: string }
      >(getFirebaseFunctions(), "setModeratorAccess");
      await setModeratorAccess({
        target_user_id: targetUser.user_id,
        enabled: targetUser.role !== "moderator",
      });
      setNotice(targetUser.role === "moderator" ? "Moderator access removed." : "Moderator access granted.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function updateProductStatus(product: AdRow, status: "sold" | "deleted") {
    setBusyId(product.id);
    setNotice("");
    setError("");
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.runTransaction(db, async (transaction) => {
        const productRef = firestore.doc(db, "ads", product.id);
        const current = await transaction.get(productRef);
        if (!current.exists() || current.data().status !== product.status) {
          throw new Error("This listing changed. Refresh the products list and try again.");
        }
        transaction.update(productRef, { status, updated_at: new Date().toISOString() });
      });
      setNotice(status === "sold" ? "Listing marked as sold." : "Listing removed from public view.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function updateCategory(event: FormEvent<HTMLFormElement>, category: CategoryRow) {
    event.preventDefault();
    setBusyId(category.id);
    setError("");
    setNotice("");
    const formData = new FormData(event.currentTarget);
    try {
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.updateDoc(firestore.doc(db, "categories", category.id), {
        name_en: String(formData.get("name_en") ?? "").trim(),
        name_bn: String(formData.get("name_bn") ?? "").trim(),
      });
      setNotice("Category names updated.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("new-category");
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const parentId = String(formData.get("parent_id") ?? "");
      const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
      const firestore = await import("@firebase/firestore");
      const db = await getFirebaseDb();
      await firestore.setDoc(firestore.doc(db, "categories", slug), {
        slug,
        name_en: String(formData.get("name_en") ?? "").trim(),
        name_bn: String(formData.get("name_bn") ?? "").trim(),
        parent_id: parentId || null,
        icon: "tag",
        sort_order: 100,
      });
      form.reset();
      setNotice("Category created.");
      await refresh();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyId("");
    }
  }

  if (!firebaseConfigured) {
    return <main className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-6"><Panel><h1 className="text-xl font-bold text-slate-950">Firebase is not configured</h1><p className="mt-3 text-sm leading-6 text-slate-600">Copy the Firebase values from `.env.example` to `.env.local` and restart the app.</p></Panel></main>;
  }

  if (loading && !role && !error) {
    return <main className="mx-auto min-h-[65vh] max-w-7xl px-4 py-16 text-center text-sm text-slate-600 sm:px-6 lg:px-8">Checking your secure TurnOver workspace access…</main>;
  }

  if (accessDenied) {
    return (
      <main className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-6">
        <Panel>
          <h1 className="text-xl font-bold text-slate-950">{requiredRole === "admin" ? "Administrator access required" : "Moderator access required"}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {requiredRole === "admin" && user?.email?.toLowerCase() === ownerEmail
              ? "Use the owner account to claim the first administrator role. This one-time action only succeeds if no administrator has been set up."
              : requiredRole === "admin"
                ? "This private admin console is available only to administrators. Moderators can use the separate moderation page."
                : "This review workspace is available only to moderators. Administrators can review listings from the admin console."}
          </p>
          {requiredRole === "admin" && user?.email?.toLowerCase() === ownerEmail && (
            <button className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-60" disabled={bootstrapping} onClick={bootstrapFirstAdmin} type="button">
              {bootstrapping ? "Setting up administrator…" : "Set up first administrator"}
            </button>
          )}
          {error && <p aria-live="assertive" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
        </Panel>
      </main>
    );
  }

  if (error && !role) {
    return (
      <main className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-6">
        <Panel>
          <h1 className="text-xl font-bold text-slate-950">Workspace setup needs attention</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
          <button className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white" onClick={() => router.refresh()} type="button">Try again</button>
        </Panel>
      </main>
    );
  }

  if (!loading && !role) {
    return (
      <main className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-6">
        <Panel>
          <h1 className="text-xl font-bold text-slate-950">This workspace is for authorized staff</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Your account is signed in, but it does not have an Admin or Moderator role. Ask an administrator if you need access.</p>
        </Panel>
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "ads", label: "Ad review" },
    { id: "issues", label: "Bug findings" },
    ...(role === "admin" ? [
      { id: "products" as const, label: "Products" },
      { id: "categories" as const, label: "Categories" },
      { id: "reports" as const, label: "Reports" },
      { id: "users" as const, label: "Users & moderators" },
    ] : []),
  ];

  return (
    <main className="min-h-[70vh] bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <PageTitle
            description="Review listings, track site issues, and keep the marketplace trustworthy."
            eyebrow={role === "admin" ? "Administrator" : "Moderator"}
            title={role === "admin" ? "Administrator console" : "Moderator review"}
          />
          <div className="flex items-center gap-3">
            <span className="max-w-48 truncate text-xs text-slate-500">{user?.email}</span>
            <button className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={refresh} type="button">Refresh</button>
          </div>
        </div>

        <nav aria-label="Operations sections" className="mt-7 flex gap-2 overflow-x-auto border-b border-slate-200">
          {tabs.map((item) => (
            <button
              aria-current={tab === item.id ? "page" : undefined}
              className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === item.id ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {notice && <p aria-live="polite" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
        {error && <p aria-live="assertive" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        {loading && <p className="mt-5 text-sm text-slate-500">Refreshing workspace data…</p>}

        {tab === "overview" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Awaiting review" value={counts.pendingAds} note="Ads remain private until approved" />
              <StatCard label="Published listings" value={counts.activeAds} note="Visible to marketplace visitors" />
              <StatCard label="Open bug findings" value={counts.openIssues} note="Reported by the team and community" />
              {role === "admin" && <StatCard label="Unresolved ad reports" value={counts.openReports} note="Available to administrators only" />}
            </div>
            {role === "admin" && (
              <Panel>
                <h2 className="text-lg font-bold text-slate-950">System and security overview</h2>
                <p className="mt-1 text-sm text-slate-600">Operational status based on the latest successful database queries.</p>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-slate-500">Marketplace database</dt><dd className="mt-1 font-semibold text-emerald-800">Firebase Firestore · connected</dd></div>
                  <div><dt className="text-slate-500">Sign-in provider</dt><dd className="mt-1 font-semibold text-slate-900">Firebase Auth</dd></div>
                  <div><dt className="text-slate-500">Authorization</dt><dd className="mt-1 font-semibold text-slate-900">Firestore security rules and Firebase claims</dd></div>
                  <div><dt className="text-slate-500">Last database check</dt><dd className="mt-1 font-semibold text-slate-900">{connectedAt ? dateFormatter.format(new Date(connectedAt)) : "Checking…"}</dd></div>
                </dl>
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Secret keys, service credentials, and raw security tokens are never displayed in this browser workspace.</p>
              </Panel>
            )}
            <Panel>
              <h2 className="text-lg font-bold text-slate-950">Quick actions</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800" onClick={() => setTab("ads")} type="button">Review pending ads ({counts.pendingAds})</button>
                <button className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setTab("issues")} type="button">Review bug findings ({counts.openIssues})</button>
                {role === "admin" && <button className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setTab("users")} type="button">Manage moderators</button>}
                {role === "admin" && <button className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setTab("products")} type="button">Manage products</button>}
              </div>
            </Panel>
          </div>
        )}

        {tab === "ads" && (
          <div className="mt-6 space-y-4">
            <PageTitle description="Only approved ads become public. Moderators can review and decide listing status, but cannot change ad content or staff permissions." eyebrow="Private queue" title={`Ads awaiting review · ${ads.length}`} />
            {ads.length === 0 ? <EmptyState title="The review queue is clear" text="New submissions will appear here as soon as they are sent for approval." /> : ads.map((ad) => (
              <Panel className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between" key={ad.id}>
                {ad.photoUrl && (
                  <StaffListingPhoto title={ad.title} url={ad.photoUrl} />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-950">{ad.title}</h2>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-800">{ad.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{formatBDT(ad.price)} · {ad.condition}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{ad.description}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {[ad.category?.[0]?.name_en, ad.location?.[0]?.name_en, ad.seller?.[0]?.display_name, dateFormatter.format(new Date(ad.created_at))].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-2 break-all text-[11px] text-slate-400">Listing ID: {ad.id}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busyId === ad.id} onClick={() => moderateAd(ad.id, "active")} type="button">Approve</button>
                  <button className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={busyId === ad.id} onClick={() => moderateAd(ad.id, "rejected")} type="button">Reject</button>
                </div>
              </Panel>
            ))}
          </div>
        )}

        {tab === "products" && role === "admin" && (
          <div className="mt-6 space-y-4">
            <PageTitle description="Review marketplace inventory across statuses. Removed listings are soft-deleted so audit and report references remain intact." eyebrow="Inventory" title={`Products · ${products.length}`} />
            {products.length === 0 ? <EmptyState title="No listings yet" text="Seller submissions will appear after the posting flow is connected." /> : products.map((product) => (
              <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" key={product.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-950">{product.title}</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{product.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{formatBDT(product.price)} · {product.condition}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {[product.category?.[0]?.name_en, product.location?.[0]?.name_en, product.seller?.[0]?.display_name, dateFormatter.format(new Date(product.created_at))].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-2 break-all text-[11px] text-slate-400">Listing ID: {product.id}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {product.status === "pending" && <button className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setTab("ads")} type="button">Review</button>}
                  {product.status === "active" && <button className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busyId === product.id} onClick={() => updateProductStatus(product, "sold")} type="button">Mark sold</button>}
                  {!["deleted", "sold"].includes(product.status) && <button className="min-h-10 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={busyId === product.id} onClick={() => updateProductStatus(product, "deleted")} type="button">Remove</button>}
                </div>
              </Panel>
            ))}
            {products.length === 100 && <p className="text-center text-xs text-slate-500">Showing the 100 most recent listings.</p>}
          </div>
        )}

        {tab === "categories" && role === "admin" && (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel>
              <h2 className="text-lg font-bold text-slate-950">Add a category</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Use a simple lowercase URL slug. Add subcategories by selecting a parent.</p>
              <form className="mt-5 space-y-4" onSubmit={addCategory}>
                <label className="block text-sm font-semibold text-slate-800" htmlFor="category-name-en">English name</label>
                <input className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" id="category-name-en" maxLength={80} name="name_en" required />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="category-name-bn">Bangla name</label>
                <input className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" id="category-name-bn" maxLength={80} name="name_bn" required />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="category-slug">URL slug</label>
                <input className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" id="category-slug" maxLength={120} name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="home-appliances" required />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="category-parent">Parent category (optional)</label>
                <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" defaultValue="" id="category-parent" name="parent_id">
                  <option value="">Top-level category</option>
                  {categories.filter((category) => !category.parent_id).map((category) => <option key={category.id} value={category.id}>{category.name_en}</option>)}
                </select>
                <button className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busyId === "new-category"} type="submit">{busyId === "new-category" ? "Saving…" : "Add category"}</button>
              </form>
            </Panel>
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-950">Existing categories · {categories.length}</h2>
              {categories.map((category) => (
                <Panel key={category.id}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-slate-500">{category.slug}</span>
                    {category.parent_id && <span className="text-xs text-slate-500">Subcategory</span>}
                  </div>
                  <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => updateCategory(event, category)}>
                    <label className="text-xs font-semibold text-slate-600">
                      English
                      <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900" defaultValue={category.name_en} maxLength={80} name="name_en" required />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      বাংলা
                      <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900" defaultValue={category.name_bn} maxLength={80} name="name_bn" required />
                    </label>
                    <button className="min-h-10 self-end rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busyId === category.id} type="submit">Save names</button>
                  </form>
                </Panel>
              ))}
            </div>
          </div>
        )}

        {tab === "issues" && (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel>
              <h2 className="text-lg font-bold text-slate-950">Report a bug or service issue</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Include the page and steps needed to reproduce the problem. Avoid passwords or private customer data.</p>
              <form className="mt-5 space-y-4" onSubmit={submitIssue}>
                <label className="block text-sm font-semibold text-slate-800" htmlFor="issue-title">Short title</label>
                <input className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" id="issue-title" maxLength={140} minLength={4} name="title" required />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="issue-details">What happened?</label>
                <textarea className="min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm" id="issue-details" maxLength={4000} minLength={10} name="details" required />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="issue-page">Page path</label>
                <input className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" defaultValue="/" id="issue-page" maxLength={500} name="page_path" />
                <label className="block text-sm font-semibold text-slate-800" htmlFor="issue-severity">Severity</label>
                <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" defaultValue="medium" id="issue-severity" name="severity">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
                <button className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busyId === "new-issue"} type="submit">{busyId === "new-issue" ? "Submitting…" : "Submit finding"}</button>
              </form>
            </Panel>
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-950">Recent findings</h2>
              {issues.length === 0 ? <EmptyState title="No bug findings yet" text="Submitted issues will show here for the team to review." /> : issues.map((issue) => (
                <Panel key={issue.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-950">{issue.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{issue.status.replace("_", " ")} · {issue.severity}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{issue.details}</p>
                  <p className="mt-3 text-xs text-slate-500">{issue.page_path} · {dateFormatter.format(new Date(issue.created_at))}</p>
                  {role === "admin" && issue.status !== "resolved" && (
                    <div className="mt-4 flex gap-2">
                      {issue.status === "open" && <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={busyId === issue.id} onClick={() => updateIssue(issue.id, "in_progress")} type="button">Mark in progress</button>}
                      <button className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800" disabled={busyId === issue.id} onClick={() => updateIssue(issue.id, "resolved")} type="button">Resolve</button>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          </div>
        )}

        {tab === "reports" && role === "admin" && (
          <div className="mt-6 space-y-4">
            <PageTitle description="Review community reports about live listings. Report details are available to administrators only." eyebrow="Trust & safety" title={`Unresolved reports · ${reports.length}`} />
            {reports.length === 0 ? <EmptyState title="No unresolved reports" text="New reports about active ads will appear here." /> : reports.map((report) => (
              <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" key={report.id}>
                <div>
                  <h2 className="font-bold text-slate-950">{report.ad?.[0]?.title ?? "Listing no longer available"}</h2>
                  <p className="mt-1 text-sm capitalize text-slate-600">{report.reason.replace("_", " ")}</p>
                  {report.details && <p className="mt-2 text-sm leading-6 text-slate-600">{report.details}</p>}
                  <p className="mt-2 text-xs text-slate-500">{dateFormatter.format(new Date(report.created_at))}</p>
                </div>
                <button className="min-h-11 shrink-0 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={busyId === report.id} onClick={() => resolveReport(report.id)} type="button">Mark reviewed</button>
              </Panel>
            ))}
          </div>
        )}

        {tab === "users" && role === "admin" && (
          <div className="mt-6 space-y-4">
            <PageTitle description="Grant or remove moderator access. Administrators are provisioned only through trusted database administration." eyebrow="Staff access" title={`Users & moderators · ${users.length}`} />
            {users.length === 0 ? <EmptyState title="No signed-in accounts yet" text="Users appear here after they sign in to TurnOver once." /> : users.map((account) => (
              <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" key={account.user_id}>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-950">{account.email}</h2>
                  <p className="mt-1 text-sm text-slate-600">{account.display_name} · <span className="capitalize">{account.role}</span></p>
                  <p className="mt-1 break-all text-[11px] text-slate-400">Firebase UID: {account.user_id}</p>
                </div>
                {account.role !== "admin" && (
                  <button className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold ${account.role === "moderator" ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-700 text-white hover:bg-emerald-800"} disabled:opacity-50`} disabled={busyId === account.user_id} onClick={() => toggleModerator(account)} type="button">
                    {account.role === "moderator" ? "Remove moderator" : "Make moderator"}
                  </button>
                )}
              </Panel>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
