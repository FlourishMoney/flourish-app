package com.flourishmoney.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this project rather than in an npm package (src/lib/reviewPrompt.js).
        registerPlugin(FlourishReviewPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
