function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function formatLeadSkipReasons(reasons = {}) {
  const parts = [];
  const duplicates = count(reasons.duplicate);
  const missingContact = count(reasons.missingContact);
  const missingIdentity = count(reasons.missingIdentity);
  if (duplicates)
    parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
  if (missingContact) parts.push(`${missingContact} missing phone/email`);
  if (missingIdentity) parts.push(`${missingIdentity} missing identity`);
  return parts.join(", ");
}

export function formatVerticalSweepResult(summary = {}, fallbackRequested = 0) {
  const requested = count(summary.requested) || count(fallbackRequested);
  const created = count(summary.created);
  const returned = count(summary.returned);
  const skipped = count(summary.skipped);
  const sourceBatches = count(summary.sourceBatches);
  const shortfall = Math.max(0, requested - created);
  const reasons = formatLeadSkipReasons(summary.skipReasons);

  const details = [
    `Requested ${requested}; imported ${created}`,
    `found ${returned}`,
    `skipped ${skipped}${reasons ? ` (${reasons})` : ""}`,
  ];
  if (sourceBatches)
    details.push(
      `${sourceBatches} source batch${sourceBatches === 1 ? "" : "es"}`,
    );
  if (shortfall) details.push(`short by ${shortfall}`);

  return {
    kind: requested > 0 && created >= requested ? "success" : "error",
    text: `${details.join("; ")}.`,
  };
}
