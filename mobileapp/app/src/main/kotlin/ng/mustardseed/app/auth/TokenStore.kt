package ng.mustardseed.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@Serializable
data class SignedInUser(
    val id: String,
    val email: String,
    val firstName: String,
    val fullName: String,
    val role: String,
)

/** What the app keeps between launches. Never logged, never backed up (data_extraction_rules). */
@Serializable
data class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    val user: SignedInUser,
)

interface TokenStore {
    fun read(): StoredSession?

    fun write(session: StoredSession)

    fun clear()
}

class InMemoryTokenStore : TokenStore {
    private var session: StoredSession? = null

    override fun read() = session

    override fun write(session: StoredSession) {
        this.session = session
    }

    override fun clear() {
        session = null
    }
}

/**
 * Encrypts the session with an AES-GCM key that lives in the Android Keystore and never leaves
 * it, then keeps the ciphertext in private app storage.
 */
class KeystoreTokenStore(
    context: Context,
) : TokenStore {
    private val prefs = context.getSharedPreferences("msd_session", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override fun read(): StoredSession? {
        val stored = prefs.getString(KEY, null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_LENGTH))
            val plain = cipher.doFinal(bytes, IV_LENGTH, bytes.size - IV_LENGTH)
            json.decodeFromString(StoredSession.serializer(), plain.decodeToString())
        } catch (e: Exception) {
            // A key reset (e.g. after a device restore) makes old data unreadable: sign in again.
            clear()
            null
        }
    }

    override fun write(session: StoredSession) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted =
            cipher.iv + cipher.doFinal(json.encodeToString(StoredSession.serializer(), session).encodeToByteArray())
        prefs.edit { putString(KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP)) }
    }

    override fun clear() {
        prefs.edit { remove(KEY) }
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec
                .Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "msd_session_key"
        const val KEY = "session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
    }
}
