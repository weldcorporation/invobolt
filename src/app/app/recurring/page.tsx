import { requireUserId } from "@/lib/session";
import { listSchedules } from "@/lib/schedules";
import { ScheduleManager } from "./ScheduleManager";

export const dynamic = "force-dynamic";

/**
 * Recurring schedules. Schedules are created from an invoice (the editor's
 * "Make recurring" control); this page manages what exists — pause, resume,
 * delete — and shows when each will next generate.
 */
export default async function RecurringPage() {
  const userId = await requireUserId();
  const schedules = await listSchedules(userId);

  return <ScheduleManager schedules={schedules} />;
}
