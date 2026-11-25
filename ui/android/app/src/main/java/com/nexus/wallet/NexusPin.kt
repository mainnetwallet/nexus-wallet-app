package com.nexus.wallet

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

/**
 * Native PBKDF2 for PIN hashing. The pure-JS implementation takes minutes on
 * Hermes; this keeps the same output while staying interactive. Runs off the JS
 * thread; the PIN is only ever passed as an argument, never stored here.
 */
class NexusPin(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "NexusPin"

    @ReactMethod
    fun derive(pin: String, saltHex: String, iterations: Int, keyLength: Int, promise: Promise) {
        executor.execute {
            try {
                val salt = hexToBytes(saltHex)
                val hash = Pbkdf2.sha256(pin.toByteArray(Charsets.UTF_8), salt, iterations, keyLength)
                promise.resolve(hash.joinToString("") { "%02x".format(it) })
            } catch (e: Exception) {
                promise.reject("E_PIN_KDF", "PIN key derivation failed", e)
            }
        }
    }

    override fun invalidate() {
        executor.shutdownNow()
        super.invalidate()
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "salt must be hex" }
        return ByteArray(hex.length / 2) { i ->
            hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }
}
