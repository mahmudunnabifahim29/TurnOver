"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type Locale = "en" | "bn";

export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeLocale(nextLocale: Locale) {
    if (busy || nextLocale === locale) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) {
        const result: unknown = await response.json();
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Could not change the language.";
        throw new Error(message);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the language.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-label="Choose language" className="relative inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-semibold" role="group">
      <button
        aria-pressed={locale === "en"}
        className={`min-h-7 rounded-full px-2.5 transition ${locale === "en" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
        disabled={busy}
        onClick={() => changeLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        aria-pressed={locale === "bn"}
        className={`min-h-7 rounded-full px-2.5 transition ${locale === "bn" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
        disabled={busy}
        onClick={() => changeLocale("bn")}
        type="button"
      >
        বাংলা
      </button>
      {error && <span aria-live="assertive" className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg bg-rose-50 p-2 text-rose-800 shadow">{error}</span>}
    </div>
  );
}
