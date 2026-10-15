# android/app/proguard-rules.pro — Flourish's own R8 keep rules (version 1.1, item 8b).
#
# Most of what must survive R8 is kept by the libraries themselves: Capacitor's consumer rules keep every
# plugin class (annotated @CapacitorPlugin or extending com.getcapacitor.Plugin) and its @PluginMethod,
# @PermissionCallback and @ActivityCallback methods, which the bridge finds by reflection; RevenueCat and the
# AndroidX libraries ship their own; proguard-android-optimize.txt keeps every @JavascriptInterface.
# These rules add only what this app needs on top, and say why.

# Crash reports and Play Console's stack traces keep their line numbers; the file name is hidden.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations and generic signatures, which Capacitor reads at run time to find plugin methods and options.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# This app's own plugin (FlourishReviewPlugin) and activity: registered by class, called from JavaScript by
# name. Capacitor's rules already cover a Plugin subclass; this line says so for the ones that live here.
-keep class com.flourishmoney.app.** { *; }

# The WebView's bridge to JavaScript: the class whose @JavascriptInterface methods the page calls.
-keepclassmembers class com.getcapacitor.MessageHandler {
    @android.webkit.JavascriptInterface <methods>;
}
