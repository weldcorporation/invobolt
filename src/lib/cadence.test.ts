import { describe, expect, it } from "vitest";
import {
  addDays,
  advanceDate,
  firstIssueDateAfter,
  isCadence,
} from "./cadence";

describe("isCadence", () => {
  it("narrows only the real cadences", () => {
    expect(isCadence("monthly")).toBe(true);
    expect(isCadence("quarterly")).toBe(true);
    expect(isCadence("yearly")).toBe(true);
    expect(isCadence("weekly")).toBe(false);
    expect(isCadence("")).toBe(false);
    expect(isCadence(1)).toBe(false);
  });
});

describe("advanceDate", () => {
  it("adds one cadence", () => {
    expect(advanceDate("2026-03-05", "monthly")).toBe("2026-04-05");
    expect(advanceDate("2026-03-05", "quarterly")).toBe("2026-06-05");
    expect(advanceDate("2026-03-05", "yearly")).toBe("2027-03-05");
  });

  it("rolls over year boundaries", () => {
    expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(advanceDate("2026-11-01", "quarterly")).toBe("2027-02-01");
  });

  it("clamps the day into short months", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2024-01-31", "monthly")).toBe("2024-02-29"); // leap
    expect(advanceDate("2026-08-31", "monthly")).toBe("2026-09-30");
  });

  it("clamps Feb 29 on a yearly cadence", () => {
    expect(advanceDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });
});

describe("firstIssueDateAfter", () => {
  it("is the next occurrence strictly after today", () => {
    expect(firstIssueDateAfter("2026-07-05", "monthly", "2026-07-16")).toBe(
      "2026-08-05",
    );
  });

  it("skips every past period — an old invoice must not flood the account", () => {
    expect(firstIssueDateAfter("2025-01-05", "monthly", "2026-07-16")).toBe(
      "2026-08-05",
    );
  });

  it("an occurrence landing on today is skipped too (strictly after)", () => {
    expect(firstIssueDateAfter("2026-06-16", "monthly", "2026-07-16")).toBe(
      "2026-08-16",
    );
  });
});

describe("addDays", () => {
  it("adds across month and year boundaries", () => {
    expect(addDays("2026-07-16", 14)).toBe("2026-07-30");
    expect(addDays("2026-07-25", 14)).toBe("2026-08-08");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("2026-07-16", 0)).toBe("2026-07-16");
  });
});
