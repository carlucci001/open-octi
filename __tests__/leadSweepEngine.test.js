import { describe, expect, it, vi } from "vitest";

import {
  buildLeadSweepEmailText,
  collectLeadSourceBatches,
  resolveLeadSourceBatchLimit,
  selectLeadDrafts,
} from "../lib/apify-farrington-lead-sweep";
import { apolloPostalCodeBatch } from "../lib/lead-vendors";

function contactLead(index) {
  return {
    businessName: `Business ${index}`,
    contactName: `Owner ${index}`,
    email: `owner${index}@business${index}.test`,
    phone: `828555${String(index).padStart(4, "0")}`,
    website: `https://business${index}.test`,
  };
}

describe("Lead sweep candidate accounting", () => {
  it("accounts for all 9 results when 7 are duplicates and 2 lack contact details", () => {
    const duplicateDrafts = Array.from({ length: 7 }, (_, index) =>
      contactLead(index + 1),
    );
    const drafts = [
      ...duplicateDrafts,
      {
        businessName: "No Contact 1",
        website: "https://no-contact-1.test",
        email: "",
        phone: "",
      },
      {
        businessName: "No Contact 2",
        website: "https://no-contact-2.test",
        email: "",
        phone: "",
      },
    ];

    const selection = selectLeadDrafts({
      drafts,
      existingLeads: duplicateDrafts,
      limit: 25,
    });

    expect(selection.toCreate).toHaveLength(0);
    expect(selection.skipped).toHaveLength(9);
    expect(selection.skipReasons).toEqual({
      duplicate: 7,
      missingContact: 2,
      missingIdentity: 0,
    });
    expect(selection.reviewed).toBe(9);
    expect(selection.unprocessed).toBe(0);
  });

  it("fetches another Apollo batch until enough new contactable leads are available", async () => {
    const existing = [contactLead(1)];
    const batches = [
      [
        contactLead(1),
        { businessName: "No Contact", website: "https://no-contact.test" },
      ],
      [contactLead(2), contactLead(3)],
      [contactLead(4)],
    ];
    const fetchBatch = vi.fn(async (batchIndex) => batches[batchIndex] || []);

    const result = await collectLeadSourceBatches({
      provider: "apollo",
      limit: 2,
      maxBatches: 3,
      fetchBatch,
      assess: (items) =>
        selectLeadDrafts({ drafts: items, existingLeads: existing, limit: 2 }),
    });

    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(result.batchesRun).toBe(2);
    expect(result.assessment.toCreate.map((lead) => lead.businessName)).toEqual(
      ["Business 2", "Business 3"],
    );
  });

  it("continues to the next Apollo ZIP batch when the first batch has no matches", async () => {
    const batches = [[], [contactLead(1), contactLead(2)]];
    const fetchBatch = vi.fn(async (batchIndex) => batches[batchIndex] || []);

    const result = await collectLeadSourceBatches({
      provider: "apollo",
      limit: 2,
      maxBatches: 3,
      fetchBatch,
      assess: (items) =>
        selectLeadDrafts({ drafts: items, existingLeads: [], limit: 2 }),
    });

    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(result.batchesRun).toBe(2);
    expect(result.assessment.toCreate.map((lead) => lead.businessName)).toEqual(
      ["Business 1", "Business 2"],
    );
  });

  it("checks every allowed Apollo ZIP batch when earlier batches are empty", async () => {
    const fetchBatch = vi.fn(async () => []);

    const result = await collectLeadSourceBatches({
      provider: "apollo",
      limit: 25,
      maxBatches: 6,
      fetchBatch,
      assess: (items) =>
        selectLeadDrafts({ drafts: items, existingLeads: [], limit: 25 }),
    });

    expect(fetchBatch).toHaveBeenCalledTimes(6);
    expect(result.batchesRun).toBe(6);
    expect(result.assessment.toCreate).toEqual([]);
  });

  it("uses distinct statewide postal-code batches instead of rerunning the same 100 ZIPs", () => {
    const zips = Array.from({ length: 1091 }, (_, index) =>
      String(27000 + index),
    );
    const first = apolloPostalCodeBatch(zips, 100, 0);
    const second = apolloPostalCodeBatch(zips, 100, 1);

    expect(first).toHaveLength(100);
    expect(second).toHaveLength(100);
    expect(new Set(first).intersection(new Set(second)).size).toBe(0);
  });

  it("uses one paid source batch when a configured ZIP override already fits one request", () => {
    const configuredZips = Array.from({ length: 50 }, (_, index) =>
      String(28000 + index),
    );
    const statewideZips = Array.from({ length: 1091 }, (_, index) =>
      String(27000 + index),
    );

    expect(
      resolveLeadSourceBatchLimit({
        provider: "apollo",
        configuredZips,
        resolvedZips: statewideZips,
      }),
    ).toBe(1);
    expect(apolloPostalCodeBatch(configuredZips, 100, 1)).toEqual([]);
  });

  it("defaults statewide Apollo searches to two paid batches unless the operator raises the cap", () => {
    const statewideZips = Array.from({ length: 1091 }, (_, index) =>
      String(27000 + index),
    );

    expect(
      resolveLeadSourceBatchLimit({ provider: "apollo", resolvedZips: statewideZips }),
    ).toBe(2);
    expect(
      resolveLeadSourceBatchLimit({
        provider: "apollo",
        resolvedZips: statewideZips,
        maxPaidBatches: 6,
      }),
    ).toBe(6);
  });

  it("stops duplicate-only Apollo backfill at the six-batch paid-call cap", async () => {
    const existing = [contactLead(1)];
    const fetchBatch = vi.fn(async () => [contactLead(1)]);

    const result = await collectLeadSourceBatches({
      provider: "apollo",
      limit: 25,
      maxBatches: 6,
      fetchBatch,
      assess: (items) =>
        selectLeadDrafts({ drafts: items, existingLeads: existing, limit: 25 }),
    });

    expect(fetchBatch).toHaveBeenCalledTimes(6);
    expect(result.batchesRun).toBe(6);
    expect(result.assessment.toCreate).toHaveLength(0);
  });

  it("describes email skips as duplicate/contact/identity checks, not all missing contact data", () => {
    const text = buildLeadSweepEmailText({
      created: [],
      skipped: Array.from({ length: 9 }, () => ({})),
      skipReasons: { duplicate: 7, missingContact: 2, missingIdentity: 0 },
      query: "computer stores",
      location: "North Carolina",
      vertical: { label: "computer stores", leadWith: "AI automation" },
    });

    expect(text).toContain(
      "Skipped after duplicate/contact/identity checks: 9 (7 duplicates, 2 missing phone/email)",
    );
    expect(text).not.toContain("Skipped without phone/email: 9");
  });
});
