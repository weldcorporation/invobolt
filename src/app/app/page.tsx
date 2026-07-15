import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Workspace home. The layout has already gated on the feature flag and the
 * middleware on the session, so here we just greet the signed-in user. Saved
 * invoices, status tracking, and clients arrive in later PRs.
 */
export default async function WorkspaceHome() {
  const session = await auth();
  const email = session?.user?.email ?? "your account";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your invoices</h1>
          <p className="text-sm text-neutral-500">Signed in as {email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
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
