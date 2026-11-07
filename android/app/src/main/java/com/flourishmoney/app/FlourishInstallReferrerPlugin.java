package com.flourishmoney.app;

import android.content.pm.PackageManager;
import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;

// Google Play's Install Referrer: the src and cr a /get link put on the store link. Read once per install, from
// src/lib/attribution.js, which keeps the answer. This only reads: it stores and sends nothing.
@CapacitorPlugin(name = "FlourishInstallReferrer")
public class FlourishInstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void read(PluginCall call) {
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        AtomicBoolean answered = new AtomicBoolean(false);
        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                if (!answered.compareAndSet(false, true)) return;
                try {
                    if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                        ReferrerDetails details = client.getInstallReferrer();
                        resolve(call, details.getInstallReferrer());
                    } else if (responseCode == InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED) {
                        resolve(call, "");
                    } else {
                        call.reject("unavailable");
                    }
                } catch (Exception e) {
                    call.reject("unavailable");
                } finally {
                    client.endConnection();
                }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                if (answered.compareAndSet(false, true)) call.reject("unavailable");
            }
        });
    }

    private void resolve(PluginCall call, String referrer) {
        JSObject result = new JSObject();
        result.put("referrer", referrer == null ? "" : referrer);
        long installed = 0;
        try {
            installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).firstInstallTime;
        } catch (PackageManager.NameNotFoundException e) {
            // 0 reads as an old install: not counted.
        }
        result.put("firstInstallTime", installed);
        call.resolve(result);
    }
}
