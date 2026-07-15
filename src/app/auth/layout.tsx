import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isWorkspaceEnabled } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Auth pages (sign-in). Returns 404 unless workspace mode is enabled, so a
 * default instant-only deployment exposes no auth surface. Kept outside the
 * proxy's /app matcher so it is reachable without a session.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  if (!isWorkspaceEnabled()) notFound();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {children}
    </div>
  );
}
