import { describe, it, expect } from "vitest";
import {
  DISPLAY_ORDER,
  STATUSES,
  TRANSITIONS,
  canTransition,
  displayStatus,
  groupByDisplayStatus,
  isInvoiceStatus,
  sourcesFor,
  transitionLabel,
  type InvoiceStatus,
} from "@/lib/status";

describe("the status set", () => {
  it("is exactly what the column stores", () => {
    expect([...STATUSES].sort()).toEqual(["draft", "paid", "sent", "void"]);
  });

  it("does not contain overdue — it is derived, never stored", () => {
    expect(STATUSES).not.toContain("overdue");
    expect(isInvoiceStatus("overdue")).toBe(false);
  });

  it("narrows untrusted input, since actions are public endpoints", () => {
    expect(isInvoiceStatus("paid")).toBe(true);
    expect(isInvoiceStatus("PAID")).toBe(false);
    expect(isInvoiceStatus("")).toBe(false);
    expect(isInvoiceStatus(null)).toBe(false);
    expect(isInvoiceStatus(7)).toBe(false);
    expect(isInvoiceStatus(["paid"])).toBe(false);
  });
});

describe("transitions", () => {
  it("walks the forward path draft -> sent -> paid", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "paid")).toBe(true);
  });

  it("cannot skip straight from draft to paid", () => {
    expect(canTransition("draft", "paid")).toBe(false);
  });

  it("can void any live status", () => {
    expect(canTransition("draft", "void")).toBe(true);
    expect(canTransition("sent", "void")).toBe(true);
    expect(canTransition("paid", "void")).toBe(true);
  });

  it("offers an undo for each forward move", () => {
    expect(canTransition("sent", "draft")).toBe(true);
    expect(canTransition("paid", "sent")).toBe(true);
    expect(canTransition("void", "draft")).toBe(true);
  });

  it("never allows a transition to itself", () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("only ever names real statuses", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) expect(isInvoiceStatus(target)).toBe(true);
    }
  });

  it("leaves every status reachable, so nothing is a dead end", () => {
    for (const status of STATUSES) {
      expect(TRANSITIONS[status].length).toBeGreaterThan(0);
      expect(sourcesFor(status).length).toBeGreaterThan(0);
    }
  });
});

describe("sourcesFor", () => {
  it("inverts the transition table", () => {
    expect(sourcesFor("paid")).toEqual(["sent"]);
    expect([...sourcesFor("void")].sort()).toEqual(["draft", "paid", "sent"]);
    expect([...sourcesFor("sent")].sort()).toEqual(["draft", "paid"]);
  });

  it("agrees with canTransition for every pair", () => {
    for (const to of STATUSES) {
      for (const from of STATUSES) {
        expect(sourcesFor(to).includes(from)).toBe(canTransition(from, to));
      }
    }
  });
});

describe("displayStatus", () => {
  const today = "2026-07-15";

  it("shows a sent invoice past its due date as overdue", () => {
    expect(displayStatus("sent", "2026-07-14", today)).toBe("overdue");
  });

  it("does not call an invoice due today overdue", () => {
    expect(displayStatus("sent", today, today)).toBe("sent");
  });

  it("leaves a sent invoice due later alone", () => {
    expect(displayStatus("sent", "2026-07-16", today)).toBe("sent");
  });

  it("only ever derives overdue from sent", () => {
    const past = "2020-01-01";
    expect(displayStatus("draft", past, today)).toBe("draft");
    expect(displayStatus("paid", past, today)).toBe("paid");
    expect(displayStatus("void", past, today)).toBe("void");
  });

  it("handles an invoice with no due date", () => {
    expect(displayStatus("sent", null, today)).toBe("sent");
  });

  it("re-derives on a date rollover rather than going stale", () => {
    const invoice = { status: "sent", dueDate: "2026-07-15" } as const;
    expect(displayStatus(invoice.status, invoice.dueDate, "2026-07-15")).toBe("sent");
    expect(displayStatus(invoice.status, invoice.dueDate, "2026-07-16")).toBe("overdue");
  });
});

describe("DISPLAY_ORDER", () => {
  it("puts what needs attention first", () => {
    expect(DISPLAY_ORDER[0]).toBe("overdue");
  });

  it("covers every stored status plus overdue, with no duplicates", () => {
    expect([...DISPLAY_ORDER].sort()).toEqual([
      "draft",
      "overdue",
      "paid",
      "sent",
      "void",
    ]);
  });
});

describe("groupByDisplayStatus", () => {
  const today = "2026-07-15";
  const row = (
    id: string,
    status: InvoiceStatus,
    dueDate: string | null = null,
  ) => ({ id, status, dueDate });

  it("splits sent invoices by whether they are past due", () => {
    const groups = groupByDisplayStatus(
      [row("a", "sent", "2026-07-01"), row("b", "sent", "2026-08-01")],
      today,
    );
    expect(groups.map((g) => g.status)).toEqual(["overdue", "sent"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("orders groups by what needs attention, not by input order", () => {
    const groups = groupByDisplayStatus(
      [row("p", "paid"), row("d", "draft"), row("o", "sent", "2020-01-01")],
      today,
    );
    expect(groups.map((g) => g.status)).toEqual(["overdue", "draft", "paid"]);
  });

  it("drops empty groups", () => {
    const groups = groupByDisplayStatus([row("d", "draft")], today);
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe("draft");
  });

  it("returns nothing for no invoices", () => {
    expect(groupByDisplayStatus([], today)).toEqual([]);
  });

  it("keeps every invoice — each lands in exactly one group", () => {
    const rows = [
      row("a", "draft"),
      row("b", "sent", "2020-01-01"),
      row("c", "sent", "2030-01-01"),
      row("d", "paid"),
      row("e", "void"),
      row("f", "draft", "2020-01-01"),
    ];
    const grouped = groupByDisplayStatus(rows, today).flatMap((g) => g.items);
    expect(grouped).toHaveLength(rows.length);
    expect(grouped.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("transitionLabel", () => {
  it("reads correctly for where you are coming from", () => {
    expect(transitionLabel("draft", "sent")).toBe("Mark as sent");
    expect(transitionLabel("sent", "paid")).toBe("Mark as paid");
    expect(transitionLabel("sent", "draft")).toBe("Back to draft");
    expect(transitionLabel("paid", "sent")).toBe("Mark as unpaid");
    expect(transitionLabel("void", "draft")).toBe("Restore");
    expect(transitionLabel("draft", "void")).toBe("Void");
  });

  it("labels every legal transition", () => {
    for (const from of STATUSES) {
      for (const to of TRANSITIONS[from]) {
        expect(transitionLabel(from, to as InvoiceStatus)).toBeTruthy();
      }
    }
  });
});
