// src/components/navigation/SignOutButton.tsx
"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  const handleClick = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-500 transition-colors"
    >
      Sign out
    </button>
  );
}