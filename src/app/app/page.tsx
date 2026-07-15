import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";

/**
 * Workspace home. The layout has already gated on the feature flag and the
 * proxy on the Neon Auth session, so here we just greet the signed-in user.
 * Saved invoices, status tracking, and clients arrive in later PRs.
 */
export default async function WorkspaceHome() {
  const { data: session } = await getAuth().getSession();
  const email = session?.user?.email ?? "your account";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your invoices</h1>
          <p className="text-sm text-neutral-500">Signed in as {email}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Saved invoices, status tracking, and clients are coming next.
        <br />
        For now, create invoices instantly on the{" "}
        <Link href="/" className="font-medium text-bolt-amberDark underline">
          home page
        </Link>
        .
      </div>
    </div>
  );
}
