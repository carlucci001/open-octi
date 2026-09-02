import { describe, expect, it } from "vitest";

import { formatVerticalSweepResult } from "../lib/lead-sweep-outcome";

describe("Lead Lab vertical sweep result", () => {
  it("reports the failed 25-to-9-to-0 run as a shortfall error with complete reasons", () => {
    const outcome = formatVerticalSweepResult({
      requested: 25,
      returned: 9,
      created: 0,
      skipped: 9,
      skipReasons: { duplicate: 7, missingContact: 2, missingIdentity: 0 },
      sourceBatches: 1,
    });

    expect(outcome.kind).toBe("error");
    expect(outcome.text).toContain("Requested 25; imported 0");
    expect(outcome.text).toContain("7 duplicates");
    expect(outcome.text).toContain("2 missing phone/email");
    expect(outcome.text).toContain("short by 25");
  });

  it("reports a fully filled run as success", () => {
    const outcome = formatVerticalSweepResult({
      requested: 25,
      returned: 31,
      created: 25,
      skipped: 6,
      skipReasons: { duplicate: 4, missingContact: 2, missingIdentity: 0 },
      sourceBatches: 3,
    });

    expect(outcome.kind).toBe("success");
    expect(outcome.text).toContain("Requested 25; imported 25");
    expect(outcome.text).not.toContain("short by");
  });
});
