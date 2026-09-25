# Native builds — iOS and Android

Written 2026-09-22 when both native builds were first produced on the founder's Mac.
This file exists so the store-account questions stop being re-asked.

## Store accounts — BOTH EXIST AND ARE PAID. No new store cost.

| | Status |
|---|---|
| Apple Developer Program | Active, paid, under the founder's account. **Team ID `V8B8MR88SL`** |
| Google Play developer account | Active, paid — the same account that ships GrowSmart. The Flourish draft app was created 2026-09-22 |

Neither platform needs a new purchase, a new membership or a renewal to ship the first
build. If a plan or an estimate says otherwise, it is out of date: correct it rather
than budgeting for it again. The Team ID is an identifier, not a credential — it is in
every provisioning profile — so it belongs here; passwords, keys and the Play signing
material do not.

## Identifiers and versions

| | iOS | Android |
|---|---|---|
| id | `app.flourishmoney` | `com.flourishmoney.app` |
| version | 1.0.0 | 1.0.0 (`versionName`) |
| build | 526891 (`CURRENT_PROJECT_VERSION`) | 2 (`versionCode`) |

The iOS build number is not a small counter and must not be reset to one. App Store Connect
already holds builds 1, 2 and 526890 against version 1.0 from July and August 2026, and it
refuses a number it has seen before (error 90189, "Redundant Binary Upload"). Before bumping
it, check what TestFlight already has rather than the last number in this repo — the two are
not the same history. Android is unaffected: its `versionCode` is a separate sequence and
Play has only ever had 1.

The two ids differ, deliberately and confirmed: the App Store Connect record predates
the Play draft. Do not "fix" one to match the other — changing a shipped id means a new
store record.

Build numbers start at 1 because nothing has been uploaded to either store. Both stores
require the build number to increase with every upload of the same version.

## Building

Web payload first, always — both platforms bundle `dist/`, and neither has a
`server.url`, so a stale `dist/` ships stale code:

```
npm run build
npx cap sync ios        # and/or: npx cap sync android
```

iOS (Xcode 26.5; decision P15 keeps Xcode 26 and defers the Capacitor 8.5 UIScene
migration to January):

```
cd ios/App
xcodebuild -scheme App -configuration Release -destination 'generic/platform=iOS' build
```

Android needs **JDK 21** and the SDK path exported. JDK 17 is too old — Capacitor 8's
android library compiles at source release 21 — and JDK 26 is too new: AGP 8.13's jlink
system-modules transform fails on it. `openjdk@21` is keg-only, so it does not disturb
the 17 and 26 already installed:

```
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
cd android && ./gradlew assembleDebug        # bundleRelease once signing is configured
```

## Still outstanding

1. **iOS signing.** The Release build above is unsigned. To run on a device: open
   `ios/App/App.xcodeproj` in Xcode, select team `V8B8MR88SL`, Run. TestFlight needs a
   distribution certificate and profile from that team.
2. **Android upload keystore.** Not generated, and no signing material is in this repo.
   The founder generates it:
   `keytool -genkeypair -v -keystore flourish-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
   The `.jks` lives OUTSIDE the repo (e.g. `~/keys/`), its passwords go in
   `~/.gradle/gradle.properties`, and `android/app/build.gradle` gets a `signingConfigs`
   block that reads those properties. Losing this key means a new Play listing, so back
   it up before the first upload.
3. **Camera usage strings — deliberately absent.** Nothing in the app touches a camera
   or the photo library: the only file input is `accept=".pdf,.csv"` (the iOS document
   picker, no permission needed), there is no `getUserMedia` and no `@capacitor/camera`,
   and Plaid is the web CDN Link script rather than the native SDK. Declaring
   `NSCameraUsageDescription` for a permission never requested invites an App Review
   question and makes the privacy label wrong. Add the strings in the same commit as a
   feature that actually needs them.

## What each build was verified to contain

API base `https://flourishmoney.app`; no localhost, staging or deploy-preview string;
no `sk-ant-`, `sb_secret_`, `sk_live_` or `service_role` prefix; the Plaid read-only
consent modal and the AI notice screen both present.

`.env.local` on the founder's Mac holds the production Supabase URL and publishable key
— public client-side values that already ship in the web bundle, so P14 does not cover
them — plus an `ANTHROPIC_API_KEY`, which is server-side only and cannot reach a client
build because Vite inlines `VITE_`-prefixed variables only. That key is scheduled for
rotation at the October 26 billing go-live.
