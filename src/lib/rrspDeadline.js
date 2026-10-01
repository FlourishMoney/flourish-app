// src/lib/rrspDeadline.js
// -----------------------------------------------------------------------------
// THE RRSP CONTRIBUTION DEADLINE, computed (prelaunch-copy, prompt 3b, item 3f).
//
// The coach used to say "March 1" every year. The CRA rule: the contribution year "ends on the 60th
// day of the following year", and when that day is a Saturday or Sunday it "ends on the first business
// day that follows". So it is March 1 in most years, February 29 after a leap-year January, and the
// Monday after when it lands on a weekend. Checked against the CRA, 2026-10-01: "March 2, 2026 is the
// deadline for contributing to an RRSP for the 2025 tax year" (March 1, 2026 was a Sunday).
// https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/important-dates-rrsp-rrif-rdsp.html
// https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/completing-slips-summaries/financial-slips-summaries/rrsp-contribution-receipt-return/contribution-year.html
// -----------------------------------------------------------------------------

// The last day to contribute for a tax year, as a local date (no time of day).
export function rrspDeadline(taxYear) {
  const d = new Date(taxYear + 1, 0, 60); // January 60 = the 60th day of the following year
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return d;
}

// The next deadline on or after today: for last tax year until it passes, then for this one.
export function nextRrspDeadline(today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastYear = today.getFullYear() - 1;
  const d = rrspDeadline(lastYear);
  return t <= d ? { taxYear: lastYear, date: d } : { taxYear: lastYear + 1, date: rrspDeadline(lastYear + 1) };
}

export function formatRrspDeadline(date) {
  return date.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}
