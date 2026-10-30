import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("locale" in body) ||
    (body.locale !== "en" && body.locale !== "bn")
  ) {
    return NextResponse.json({ error: "Choose English or Bangla." }, { status: 400 });
  }

  const response = NextResponse.json({ locale: body.locale });
  response.cookies.set("turnover-locale", body.locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
