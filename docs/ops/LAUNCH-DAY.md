# Launch day: when a store approval email arrives

Triggered by an **approval email**, not a date. The October 20 launch date was dropped on October 14:
each store releases on its own approval. Do this runbook once for the App Store and once for Google Play,
on whichever morning each approval arrives. There was no `LAUNCH-DAY-OCT-20.md` to replace.

**Not in this runbook: any waitlist email.** The only waitlist email left is the October 26 founding and
launch news email, and `docs/ops/BILLING-DAY-OCT-26.md` owns it. Do not email the waitlist on launch day.

Names, not line numbers: every line number in older docs is stale.

---

## A. The App Store approval email ("Your submission was accepted" / status "Pending Developer Release")

1. Open **App Store Connect** → **Apps** → **Flourish: Money, Handled** (Apple ID 6792967778).
2. In the left column under **iOS App**, click the version the email names.
3. Check the status at the top reads **Pending Developer Release**. If it reads anything else, stop: the
   approval is not for this version.
4. Check the build number shown under **Build** is the one you meant to ship (`docs/ops/NATIVE-BUILDS.md`
   records which builds are not to release).
5. Click **Release This Version** (top right), then **Release** in the confirmation.
6. Status changes to **Processing for App Store**, then **Ready for Distribution**. The store page can take
   up to 24 hours to appear in every region; in Canada it is usually within a few hours.
7. Go to section C.

## B. The Google Play approval email

**Only if production access has been granted.** A new personal developer account must finish closed
testing and be granted production access before any production release. If the Play Console
**Dashboard** still shows **Apply for production access**, there is nothing to release today: stop here,
and leave the build in closed testing.

1. Open **Play Console** → **Flourish** (package `com.flourishmoney.app`).
2. Left menu: **Test and release** → **Production**.
3. Click **Create new release**. Under **App bundles**, click **Add from library** and choose the approved
   bundle (the version code the email names). Do not upload a new file.
4. **Release name**: leave the default. **Release notes**: paste the approved notes.
5. Click **Next**, then **Save**, then **Go to overview**, then **Send changes for review**.
6. If **Managed publishing** is on: when the changes are approved, open **Publishing overview** and click
   **Publish changes**. If it is off, the release goes live on its own after review.
7. Go to section C.

## C. Where each link goes

Each link is the website with the campaign code, so the waitlist counts each source separately
(`WAITLIST_SRCS`; once migration 0018 has run, its report counts signups by source and day). Use exactly these, one per place:

| Place | Link |
|---|---|
| Instagram bio and Instagram posts | `https://flourishmoney.app/?src=ig` |
| Facebook page and Facebook posts | `https://flourishmoney.app/?src=fb` |
| TikTok bio | `https://flourishmoney.app/?src=tt` |
| Meta ad set A | `https://flourishmoney.app/?src=meta_a` |
| Meta ad set B | `https://flourishmoney.app/?src=meta_b` |
| Press release and media kit | `https://flourishmoney.app/?src=press` |
| Your email signature and one-to-one emails | `https://flourishmoney.app/?src=email` |

`calendar` and `clawback` are for the benefit calendar and CCB clawback pages, which do not exist yet: do
not use them today.

The store pages themselves, for posts that link straight to a store:

- App Store: `https://apps.apple.com/ca/app/id6792967778`
- Google Play (only once B is done): `https://play.google.com/store/apps/details?id=com.flourishmoney.app`

**Known gap before posting:** the landing page's hero badge still says "Coming soon to iPhone and
Android". Once a store is live that line is wrong. Changing it is a code change: ask for it as its own
pull request the day before you expect an approval, and do not post the store links until it is live.

## D. The first hour: five checks

1. **Sentry.** Open Sentry → **Issues**, set the environment filter (top of the page) to **production**,
   time range **Last hour**. Expect nothing new. An issue whose release is the build now in the store, or
   the web SHA shown in the app under **Settings** → **Build**, is a launch problem: go to E.
2. **The live demo.** On your phone, open `https://flourishmoney.app`, tap **Try the demo with Canadian
   sample data**, and check Today opens with the $1,944 safe-to-spend card and the tour's step 1 does not
   cover it. Open **Watch** and **Meet** once each.
3. **The waitlist form.** On `https://flourishmoney.app`, check the email field, **Join the waitlist** and
   the consent line are on the first screen and the founding card shows a count. Do not submit a real
   household's address. Submit your own address only at `getgrowsmart.com` or `flourishmoney.app`, and only
   once migration 0025 has run, so it is stored as a test row and takes no founding
   number. Before then, do not submit at all.
4. **The App Store page.** Open the App Store link above on an iPhone with the Canadian store: the name,
   the icon, the screenshots and **Get** are there, and installing opens the app to its sign-in screen.
5. **The Google Play page** (only once B is done). Open the Play link above on an Android phone: the
   listing shows **Install**, and installing opens the app to its sign-in screen.

## E. Rollback: what can and cannot be undone

Say it plainly: **once a store release is live, people who installed it keep it.** There is no "un-install"
for their phones. What you can do:

- **App Store, before step A5:** nothing is live. Simply do not click **Release This Version**: the version
  waits in **Pending Developer Release** until you do.
- **App Store, after release:** you cannot put the previous version back. To stop new downloads, open
  **Pricing and Availability** → **App Availability** and remove Canada (and any other country), then
  **Save**. Then fix forward: a new build, submitted for review, with an expedited review requested at
  `https://developer.apple.com/contact/app-store/?topic=expedite`.
- **Google Play, during a staged rollout:** **Test and release** → **Production** → **Releases** → the
  release → **Halt rollout** stops it reaching more people. If the release is already at 100%, look for
  **Halt release** on the same page first; unpublish (next line) only if there is no halt.
- **Google Play, after a full release:** you cannot put the previous version back. To stop new installs,
  **Test and release** → **Setup** → **Advanced settings** → **App availability** → **Unpublish**. Fix
  forward with a new release.
- **The website** (flourishmoney.app): this one *can* be rolled back. Netlify → **Deploys** → the last good
  deploy → **Publish deploy**. Ask Claude which deploy is the last good one; do not change any variable.
- **The database:** a migration that has run cannot be rolled back from the dashboard. Nothing in this
  runbook runs one.

The store apps read the same server as the website. Rolling back the website does not change what the
installed apps are, only what the server and the web page do.
