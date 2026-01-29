import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export const metadata: { title: string } = {
  title: "App · LegatePro",
};

// This route depends on auth state and should never be statically cached.
export const dynamic = "force-dynamic";

export default async function AppIndexPage() {
  const session = await auth();

  if (!session?.user?.id) {
    // Redirect to login, then return to /app for post-auth routing.
    redirect("/login?callbackUrl=/app");
  }

  // Authenticated users always land on the dashboard.
  redirect("/app/dashboard");
}