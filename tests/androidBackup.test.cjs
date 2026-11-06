// tests/androidBackup.test.cjs
// -----------------------------------------------------------------------------
// NOTHING OF FLOURISH'S IS BACKED UP OR TRANSFERRED BY ANDROID (2026-11-05). In the 1.1.5 phone test a fresh install opened
// signed in to another person's account: Android had restored the app's data (the session and the household's numbers in the
// WebView's storage) from a backup. allowBackup="false" stops it on Android 11 and earlier; on 12 and later, the data
// extraction rules exclude every domain from both cloud backup and device-to-device transfer.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const t = create();
const manifest = read("android", "app", "src", "main", "AndroidManifest.xml");
t.ok(/android:allowBackup="false"/.test(manifest) && !/android:allowBackup="true"/.test(manifest), "1a allowBackup is off");
t.ok(/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest), "1b Android 12 and later read the rules below");
const rules = read("android", "app", "src", "main", "res", "xml", "data_extraction_rules.xml");
const DOMAINS = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"];
for (const section of ["cloud-backup", "device-transfer"]) {
  const m = rules.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`));
  t.ok(!!m, `2a ${section} is there`);
  const body = m ? m[1].replace(/<!--[\s\S]*?-->/g, "") : "";
  t.eq(DOMAINS.filter((d) => !new RegExp(`<exclude domain="${d}" path="\\." />`).test(body)), [], `2b ${section}: every domain excluded`);
  t.ok(!/<include /.test(body), `2c ${section}: nothing included`);
}
t.summary("androidBackup.test");
