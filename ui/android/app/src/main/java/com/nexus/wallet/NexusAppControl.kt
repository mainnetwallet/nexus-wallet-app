package com.nexus.wallet

import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NexusAppControl(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NexusAppControl"

    @ReactMethod
    fun startForegroundService(title: String, text: String, promise: Promise) {
        val intent = Intent(reactApplicationContext, NexusForegroundService::class.java).apply {
            putExtra("title", title)
            putExtra("text", text)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        reactApplicationContext.stopService(Intent(reactApplicationContext, NexusForegroundService::class.java))
        promise.resolve(null)
    }

    @ReactMethod
    fun setOrientation(portrait: Boolean, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            activity.requestedOrientation = if (portrait) {
                ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            } else {
                ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            }
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun appVersion(promise: Promise) {
        try {
            val info = reactApplicationContext.packageManager.getPackageInfo(
                reactApplicationContext.packageName,
                0
            )
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            promise.resolve(Arguments.createMap().apply {
                putDouble("versionCode", code.toDouble())
                putString("versionName", info.versionName)
            })
        } catch (e: Exception) {
            promise.reject("E_VERSION", "Could not read app version", e)
        }
    }
}
