import { requireUserId } from "@/lib/session";
import { listItems } from "@/lib/items";
import { serverStripeKey } from "@/lib/stripe";
import { StripeImport } from "./StripeImport";

export const dynamic = "force-dynamic";

/**
 * Stripe import: customers → saved clients, products → saved items. The page
 * itself only reads what's already ours; every Stripe call happens in an
 * action with a key the user pastes (see lib/stripe.ts for the key rules).
 */
export default async function ImportPage() {
  const userId = await requireUserId();
  const savedItems = await listItems(userId);

  return (
    <StripeImport
      // Only the *existence* of a server-configured key crosses to the
      // client — never the key.
      hasServerKey={serverStripeKey() !== null}
      savedItems={savedItems}
    />
  );
}
