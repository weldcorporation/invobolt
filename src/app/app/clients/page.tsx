import { requireUserId } from "@/lib/session";
import { listClients } from "@/lib/clients";
import { ClientManager } from "./ClientManager";

export const dynamic = "force-dynamic";

/**
 * Saved clients. The layout has gated on the feature flag and the proxy on the
 * session; `requireUserId` re-derives the owner so the query is scoped to it.
 */
export default async function ClientsPage() {
  const userId = await requireUserId();
  const clients = await listClients(userId);

  return <ClientManager clients={clients} />;
}
