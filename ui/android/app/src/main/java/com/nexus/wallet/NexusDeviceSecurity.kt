package com.nexus.wallet

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NexusDeviceSecurity(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NexusDeviceSecurity"

    private fun clipboard(): ClipboardManager? =
        reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

    @ReactMethod
    fun setSecureFlag(on: Boolean, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            if (on) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getClipboard(promise: Promise) {
        val clip = clipboard()?.primaryClip
        val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(reactApplicationContext)?.toString() else null
        promise.resolve(text)
    }

    @ReactMethod
    fun setClipboard(text: String, promise: Promise) {
        clipboard()?.setPrimaryClip(ClipData.newPlainText("Nexus Wallet", text))
        promise.resolve(null)
    }

    @ReactMethod
    fun clearClipboard(promise: Promise) {
        val manager = clipboard()
        if (manager != null) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                manager.clearPrimaryClip()
            } else {
                manager.setPrimaryClip(ClipData.newPlainText("", ""))
            }
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun isBiometricAvailable(promise: Promise) {
        val result = BiometricManager.from(reactApplicationContext)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        promise.resolve(result == BiometricManager.BIOMETRIC_SUCCESS)
    }

    @ReactMethod
    fun promptBiometric(title: String, subtitle: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity as? FragmentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(activity)
            val prompt = BiometricPrompt(
                activity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        promise.resolve(true)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        promise.resolve(false)
                    }
                }
            )
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .build()
            prompt.authenticate(info)
        }
    }
}
