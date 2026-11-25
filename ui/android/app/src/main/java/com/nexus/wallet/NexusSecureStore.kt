package com.nexus.wallet

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Vault storage: AES-256-GCM with a KEK derived from PBKDF2(PIN) mixed with a
 * device-bound Android Keystore HMAC. The PIN never leaves JS except as this
 * transient argument, and entries cannot be brute-forced offline without the
 * device key. Migration/rollback payloads use the same store.
 */
class NexusSecureStore(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs = reactContext.getSharedPreferences("nexus_vault", Context.MODE_PRIVATE)
    private val keyAlias = "nexus_vault_hmac_v1"

    override fun getName(): String = "NexusSecureStore"

    private fun deviceKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
        )
        return generator.generateKey()
    }

    private fun deriveKek(pin: String): ByteArray {
        val salt = prefs.getString("salt", null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: ByteArray(16).also { random ->
                SecureRandom().nextBytes(random)
                prefs.edit().putString("salt", Base64.encodeToString(random, Base64.NO_WRAP)).apply()
            }
        val pinKey = Pbkdf2.sha256(pin.toByteArray(Charsets.UTF_8), salt, 200_000, 32)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(deviceKey())
        return mac.doFinal(pinKey)
    }

    private fun encrypt(value: String, pin: String): String {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(deriveKek(pin), "AES"), GCMParameterSpec(128, iv))
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(ciphertext, Base64.NO_WRAP)
    }

    private fun decrypt(payload: String, pin: String): String {
        val parts = payload.split(".")
        require(parts.size == 2) { "Malformed vault entry" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(deriveKek(pin), "AES"), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    @ReactMethod
    fun setItem(key: String, value: String, pin: String, promise: Promise) {
        try {
            prefs.edit()
                .putString(key, encrypt(value, pin))
                .putBoolean("initialized", true)
                .apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_ENCRYPT", "Could not write vault entry", e)
        }
    }

    @ReactMethod
    fun getItem(key: String, pin: String, promise: Promise) {
        val payload = prefs.getString(key, null)
        if (payload == null) {
            promise.resolve(null)
            return
        }
        try {
            promise.resolve(decrypt(payload, pin))
        } catch (e: Exception) {
            // Wrong PIN or tampered entry: behave as a miss, never crash the UI.
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun deleteItem(key: String, promise: Promise) {
        prefs.edit().remove(key).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun rewrap(oldPin: String, newPin: String, promise: Promise) {
        try {
            val editor = prefs.edit()
            for ((key, raw) in prefs.all) {
                if (key == "salt" || key == "initialized") continue
                if (raw !is String) continue
                val plain = decrypt(raw, oldPin)
                editor.putString(key, encrypt(plain, newPin))
            }
            editor.apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun hasPin(promise: Promise) {
        promise.resolve(prefs.getBoolean("initialized", false))
    }

    @ReactMethod
    fun isStrongBoxAvailable(promise: Promise) {
        val available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            reactApplicationContext.packageManager.hasSystemFeature(
                android.content.pm.PackageManager.FEATURE_STRONGBOX_KEYSTORE
            )
        promise.resolve(available)
    }
}
