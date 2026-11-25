package com.nexus.wallet

import android.annotation.SuppressLint
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reads the legacy WebView localStorage. The legacy app stored everything under
 * the `file://` origin, so a hidden WebView loading a local bridge page shares
 * the same DOM storage. Network loading is blocked and the WebView is destroyed
 * immediately after each read. Reads never mutate; deletion happens only after
 * the JS migration orchestrator verifies the encrypted copy.
 */
class NexusLegacyStore(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val handler = Handler(Looper.getMainLooper())

    override fun getName(): String = "NexusLegacyStore"

    private val readAllScript =
        "(function(){var o={};try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k);}}catch(e){}" +
            "NexusLegacyBridge.post(JSON.stringify(o));})();"

    @SuppressLint("SetJavaScriptEnabled")
    private fun runScript(script: String, promise: Promise, transform: (String) -> Any) {
        handler.post {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("E_ACTIVITY", "No foreground activity")
                return@post
            }
            val web = WebView(activity)
            val settled = AtomicBoolean(false)
            lateinit var timeout: Runnable
            fun finish(result: Any?, error: String?) {
                if (!settled.compareAndSet(false, true)) return
                handler.removeCallbacks(timeout)
                // finish() can run on the JavaBridge thread; WebView teardown must
                // happen on the main looper or the interface and view leak.
                handler.post {
                    try {
                        web.removeJavascriptInterface("NexusLegacyBridge")
                        web.destroy()
                    } catch (_: Exception) {
                    }
                }
                if (error != null) promise.reject("E_LEGACY_READ", error) else promise.resolve(result)
            }
            timeout = Runnable { finish(null, "Legacy storage read timed out") }

            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            web.settings.databaseEnabled = true
            web.settings.allowFileAccess = true
            web.settings.allowContentAccess = false
            web.settings.allowFileAccessFromFileURLs = false
            web.settings.allowUniversalAccessFromFileURLs = false
            web.settings.blockNetworkLoads = true
            web.settings.javaScriptCanOpenWindowsAutomatically = false
            web.settings.setSupportMultipleWindows(false)

            web.addJavascriptInterface(LegacyBridge { json ->
                val value = try {
                    transform(json)
                } catch (e: Exception) {
                    finish(null, "Could not parse legacy storage")
                    return@LegacyBridge
                }
                finish(value, null)
            }, "NexusLegacyBridge")

            web.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    view?.evaluateJavascript(script, null)
                }
            }
            handler.postDelayed(timeout, 10_000)
            web.loadUrl("file:///android_asset/legacy_bridge.html")
        }
    }

    private fun parseMap(json: String): WritableMap {
        val map = Arguments.createMap()
        val obj = JSONObject(json)
        for (key in obj.keys()) {
            map.putString(key, obj.optString(key, ""))
        }
        return map
    }

    @ReactMethod
    fun readAll(promise: Promise) {
        runScript(readAllScript, promise) { json -> parseMap(json) }
    }

    @ReactMethod
    fun deleteKeys(keys: ReadableArray, promise: Promise) {
        val array = JSONArray()
        for (i in 0 until keys.size()) {
            keys.getString(i)?.let { array.put(it) }
        }
        val script = "(function(){var ks=$array;for(var i=0;i<ks.length;i++){try{localStorage.removeItem(ks[i]);}catch(e){}}" +
            "NexusLegacyBridge.post('ok');})();"
        runScript(script, promise) { true }
    }

    @ReactMethod
    fun probe(promise: Promise) {
        runScript(readAllScript, promise) { json ->
            val obj = JSONObject(json)
            var count = 0
            for (key in obj.keys()) {
                if (key.startsWith("nexus_")) count++
            }
            val info = reactApplicationContext.packageManager.getPackageInfo(
                reactApplicationContext.packageName,
                0
            )
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            Arguments.createMap().apply {
                putBoolean("present", count > 0)
                putDouble("versionCode", versionCode.toDouble())
                putInt("keyCount", count)
            }
        }
    }
}

class LegacyBridge(private val onPost: (String) -> Unit) {
    @JavascriptInterface
    fun post(json: String) {
        onPost(json)
    }
}
