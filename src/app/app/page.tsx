import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export const metadata = {
  title: "App | LegatePro",
};

export const dynamic = "force-dynamic";

export default async function AppIndexPage() {
  const session = await auth();

  if (!session?.user?.id) {
    // Send users back to the app entry route; it will forward to the dashboard after auth.
    redirect("/login?callbackUrl=/app");
  }

  redirect("/app/dashboard");
}