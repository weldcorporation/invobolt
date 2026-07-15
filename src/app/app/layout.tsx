import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isWorkspaceEnabled } from "@/lib/workspace";

// Workspace pages depend on the request (session cookie), so never prerender.
export const dynamic = "force-dynamic";

/**
 * Root of the workspace surface. Returns 404 unless workspace mode is enabled,
 * so a default (instant-only) deployment does not expose /app at all.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isWorkspaceEnabled()) notFound();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="Invobolt" width={28} height={28} />
            <div className="text-base font-bold tracking-tight">
              Invobolt <span className="text-neutral-400">Workspace</span>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-8">{children}</main>
    </div>
  );
}
