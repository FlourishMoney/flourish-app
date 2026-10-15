// tests/androidRelease.test.cjs
// -----------------------------------------------------------------------------
// VERSION 1.1, ITEM 8b: R8 ON THE ANDROID RELEASE BUILD, WITH THE KEEP RULES THE APP NEEDS.
//
// The gate cannot build a signed release (it needs the upload key and minutes of Gradle), so this pins the
// configuration; the build itself was checked by hand on 2026-10-15 (docs/ops/IAP-1.1.md, item 8):
// 7,568,172 bytes before, 5,524,130 after; every plugin class and its JavaScript-facing methods kept by name;
// the mapping file inside the bundle; no deprecated bar call left.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const gradle = read("android", "app", "build.gradle");
  const release = gradle.slice(gradle.indexOf("buildTypes {"), gradle.indexOf("buildTypes {") + 1200);
  t.ok(/release \{[\s\S]*?minifyEnabled true[\s\S]*?shrinkResources true[\s\S]*?getDefaultProguardFile\('proguard-android-optimize\.txt'\), 'proguard-rules\.pro'/.test(release),
    "b1 release builds run R8: code shrinking, resource shrinking, the optimize defaults and the app's rules");
  t.ok(!/debug \{[\s\S]*?minifyEnabled true/.test(release), "b2 …release only: a debug build is not shrunk");
  t.ok(/signingConfig project\.hasUploadSigning \? signingConfigs\.release : null/.test(release), "b3 signing is unchanged");
  const rules = read("android", "app", "proguard-rules.pro");
  t.ok(/-keepattributes SourceFile,LineNumberTable/.test(rules) && /-renamesourcefileattribute SourceFile/.test(rules), "b4 stack traces keep their line numbers");
  t.ok(/-keepattributes \*Annotation\*,Signature,InnerClasses,EnclosingMethod/.test(rules), "b5 annotations and signatures survive (Capacitor finds plugin methods by them)");
  t.ok(/-keep class com\.flourishmoney\.app\.\*\* \{ \*; \}/.test(rules), "b6 the app's own plugin and activity are kept whole");
  t.ok(/-keepclassmembers class com\.getcapacitor\.MessageHandler \{\s*@android\.webkit\.JavascriptInterface <methods>;/.test(rules), "b7 the WebView's JavaScript bridge methods are kept");
  const cap = read("node_modules", "@capacitor", "android", "capacitor", "proguard-rules.pro");
  t.ok(/-keep public class \* extends com\.getcapacitor\.Plugin \{ \*; \}/.test(cap) && /consumerProguardFiles 'proguard-rules\.pro'/.test(read("node_modules", "@capacitor", "android", "capacitor", "build.gradle")),
    "b8 Capacitor ships the rule that keeps every plugin class (Share, Local Notifications, RevenueCat, FlourishReview) and its methods");
  t.summary("androidRelease.test");
})();
