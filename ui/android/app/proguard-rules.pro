# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.react.**

# Nexus native modules are resolved by name from JS.
-keep class com.nexus.wallet.** { *; }

# WebView JS bridge
-keepclassmembers class com.nexus.wallet.LegacyBridge {
    @android.webkit.JavascriptInterface <methods>;
}
