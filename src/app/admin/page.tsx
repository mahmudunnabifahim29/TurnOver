import type { Metadata } from "next";
import AdminWorkspace from "./workspace";

export const metadata: Metadata = {
  title: "Operations workspace | TurnOver",
  description: "Private TurnOver administration and moderation workspace.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminWorkspace requiredRole="admin" />;
}
