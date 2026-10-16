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
| build | 526902 (`CURRENT_PROJECT_VERSION`) | 16 (`versionCode`) |

The two ids differ, deliberately and confirmed: the App Store Connect record predates
the Play draft. Do not "fix" one to match the other — changing a shipped id means a new
store record.

Both stores require the build number to increase with every upload of the same version. The
numbers live in tracked files, both `CURRENT_PROJECT_VERSION` lines in
`ios/App/App.xcodeproj/project.pbxproj` and `versionCode` in `android/app/build.gradle`, and a
PR bumps them before each store build. The table shows what those files carry on `main`.

## Building

Web payload first, always — both platforms bundle `dist/`, and neither has a
`server.url`, so a stale `dist/` ships stale code:

```
npm run build
npx cap sync ios        # and/or: npx cap sync android
```

iOS. **From 2026-10-14 every iOS build needs Xcode 27.1 or later and the UIScene lifecycle**
(PR #67: Capacitor 8.5.3, `ios/App/App/SceneDelegate.swift`, `UIApplicationSceneManifest` in
Info.plist). Decision P15 (Xcode 26, migration in January) is superseded: Xcode 26 is no longer on
the build Mac, and an app linked against the iOS 27 SDK without a scene manifest stops at launch
(`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`), which is an App Review 2.1(a)
rejection. Do not revert the scene files, and do not build from a branch that predates them.
Point the tools at Xcode 27.1 for the shell rather than switching the system default:

```
export DEVELOPER_DIR=/Applications/Xcode-27.1.app/Contents/Developer
cd ios/App
xcodebuild -scheme App -configuration Release -destination 'generic/platform=iOS' build
```

**Store builds carry the Sentry DSN.** An App Store archive (and a Play AAB) must be built with
`VITE_SENTRY_DSN` set in the build shell, or crashes in the store app reach no one. The DSN is not
in `.env.local`: read it from the live site's bundle (`assets/index-*.js`) into an `export` in the
build shell only. Never commit it, write it into a tracked file, or print it. Before uploading,
check that the bundle carries it (count the matching lines in `dist/assets/*.js`, do not print
them). A local test archive built without it must never be uploaded.

Android needs **JDK 21** and the SDK path exported. JDK 17 is too old — Capacitor 8's
android library compiles at source release 21 — and JDK 26 is too new: AGP 8.13's jlink
system-modules transform fails on it. `openjdk@21` is keg-only, so it does not disturb
the 17 and 26 already installed:

```
# The VITE_* variables must be present, or the app is a white screen. Netlify supplies them
# for the web; a native build gets them from this shell, and Vite does not complain when they
# are absent — it bakes `undefined` in and the build succeeds. Use build:native, never build.
npm run build:native                         # refuses to build without them, and re-checks dist/

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
