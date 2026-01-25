import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export const metadata = {
  title: "Dashboard | LegatePro",
};

export const dynamic = "force-dynamic";

export default async function AppIndexPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app/dashboard");
  }

  redirect("/app/dashboard");
}