package com.nexus.wallet

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * PBKDF2-HMAC-SHA256 via Mac, so it works on every supported API level
 * (SecretKeyFactory's "PBKDF2WithHmacSHA256" only exists from API 26).
 * Output is byte-identical to the standard construction and to @noble/hashes.
 */
object Pbkdf2 {
    fun sha256(password: ByteArray, salt: ByteArray, iterations: Int, keyLengthBytes: Int): ByteArray {
        require(iterations > 0) { "iterations must be positive" }
        require(keyLengthBytes > 0) { "keyLength must be positive" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(password, "HmacSHA256"))
        val hLen = mac.macLength
        val blocks = (keyLengthBytes + hLen - 1) / hLen
        val out = ByteArray(blocks * hLen)
        val blockIndex = ByteArray(4)
        var offset = 0
        for (i in 1..blocks) {
            blockIndex[0] = (i ushr 24).toByte()
            blockIndex[1] = (i ushr 16).toByte()
            blockIndex[2] = (i ushr 8).toByte()
            blockIndex[3] = i.toByte()
            mac.update(salt)
            mac.update(blockIndex)
            var u = mac.doFinal()
            val t = u.copyOf()
            for (j in 2..iterations) {
                u = mac.doFinal(u)
                for (k in t.indices) t[k] = (t[k].toInt() xor u[k].toInt()).toByte()
            }
            System.arraycopy(t, 0, out, offset, hLen)
            offset += hLen
        }
        return out.copyOf(keyLengthBytes)
    }
}
