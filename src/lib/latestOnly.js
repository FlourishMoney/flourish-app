// src/lib/latestOnly.js
// -----------------------------------------------------------------------------
// ONE AT A TIME, NEWEST WINS (review of 2026-11-22, P7-03).
//
// The notification reschedule cancels every reminder of a type and then schedules that type again, awaiting the
// phone for each one. Two runs could overlap: the older one, still working through its list, scheduled reminders
// from out-of-date data after the newer one had cancelled them, or cancelled what the newer one had just set.
//
// latestOnly(fn) returns a function that runs fn one call at a time, in order. A call that is overtaken while it
// waits is skipped: only the newest waiting call runs, with its own arguments. A run that throws never blocks the
// next. The promise returned resolves when that call has run or been skipped, and never rejects for an earlier
// call's failure.
// -----------------------------------------------------------------------------
export function latestOnly(fn) {
  let tail = Promise.resolve();
  let newest = 0;
  return (...args) => {
    const mine = ++newest;
    const run = tail.then(() => (mine === newest ? fn(...args) : undefined));
    tail = run.catch(() => {});
    return run;
  };
}
