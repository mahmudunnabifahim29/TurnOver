import type { Metadata } from "next";
import AdminWorkspace from "../admin/workspace";

export const metadata: Metadata = {
  title: "Moderation queue | TurnOver",
  description: "Review and approve TurnOver community listings.",
  robots: { index: false, follow: false },
};

export default function ModerationPage() {
  return <AdminWorkspace initialTab="ads" workspacePath="/moderation" />;
}
