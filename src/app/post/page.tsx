import type { Metadata } from "next";
import PostAdForm from "./post-ad-form";

export const metadata: Metadata = {
  title: "Post an ad | TurnOver",
  description: "Create a local marketplace listing on TurnOver.",
  robots: { index: false, follow: false },
};

export default function PostAdPage() {
  return <PostAdForm />;
}
