import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | TurnOver",
  description: "Sign in to your TurnOver marketplace account with Google or a secure one-time email link.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-16 text-center text-sm text-slate-600">Loading secure sign-in…</main>}>
      <LoginForm />
    </Suspense>
  );
}
