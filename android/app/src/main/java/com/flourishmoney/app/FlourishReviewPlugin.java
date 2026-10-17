package com.flourishmoney.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

// The store review prompt (version 1.1, item 4), on Google's in-app review API (Play Core review).
// When to ask is decided in src/lib/reviewRules.js; this only asks, and Google decides whether to show it.
@CapacitorPlugin(name = "FlourishReview")
public class FlourishReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        if (getActivity() == null) {
            resolve(call, false);
            return;
        }
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful()) {
                resolve(call, false);
                return;
            }
            manager.launchReviewFlow(getActivity(), request.getResult()).addOnCompleteListener(flow -> resolve(call, true));
        });
    }

    private static void resolve(PluginCall call, boolean asked) {
        JSObject result = new JSObject();
        result.put("asked", asked);
        call.resolve(result);
    }
}
