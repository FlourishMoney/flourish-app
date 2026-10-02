// src/lib/tour.js
// -----------------------------------------------------------------------------
// THE WALKTHROUGH: one step per tab (tester suggestions, item 1).
//
// The old tour named screens that no longer exist ("Activity & Budgets", "Goals & Credit") and
// promised "AI Financial Guidance: Ask anything: tax tips, debt strategy". Each step now opens its
// tab and says what that tab is, in words checked against the build:
//   Today  the hero is safe to spend until payday, net of bills, minimum debt payments, a spending
//          buffer and a savings amount (safeToSpendView), and the number is a button that opens its
//          working ("How Flourish got this number").
//   Watch  the day-by-day forecast lists bill days and paydays with dates, and the low-balance and
//          overdraft cards name the day before it comes. The brief's first sentence, "The next 90
//          days.", is left out: Watch opens on 30 days, and 90 is one of its three ranges.
//   Do     Budget, Goals (with the debt payoff simulator) and Credit.
//   Learn  the coach chat; coach.js checks every figure in a reply against the snapshot it was sent
//          and replaces a reply that cites one it was not given (snapshotGuard).
//   Meet   the agenda is written from the week (meetAgendaFor); a single person gets a solo check-in,
//          a couple a money meeting.
// -----------------------------------------------------------------------------

export const TOUR_STEPS = [
  { screen: "home",   title: "Today", body: "Your number. What's safe to spend until payday, after bills, minimum debt payments, a spending buffer and a savings amount are accounted for. Tap it to see the math." },
  { screen: "watch",  title: "Watch", body: "Every bill and payday on one dated list, so a tight day shows up before it arrives." },
  { screen: "do",     title: "Do",    body: "Your plans. Budgets, goals and debt payoff dates, calculated from your numbers." },
  { screen: "coach",  title: "Learn", body: "Your coach. Ask what a number means. It explains Flourish's math and never invents a figure." },
  { screen: "family", title: "Meet",  body: "15 minutes a week. An agenda built from your week, for you or for you and your partner." },
];

export const TOUR_DONE_KEY = "flourish_tour_done";
