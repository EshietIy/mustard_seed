package ng.mustardseed.app.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

sealed interface GoogleSignInResult {
    data class Success(
        val idToken: String,
    ) : GoogleSignInResult

    data object Cancelled : GoogleSignInResult

    data object Failed : GoogleSignInResult

    data object NoAccount : GoogleSignInResult
}

/** Gets a Google ID token for our backend; a fake is used in tests. */
fun interface GoogleSignInLauncher {
    suspend fun idToken(serverClientId: String): GoogleSignInResult
}

/**
 * Android's account picker (Credential Manager). The ID token's audience is the website's OAuth
 * client (serverClientId), which the backend already verifies; the app's own Android OAuth
 * client (package + signing key) only identifies the app to Google.
 */
class CredentialManagerSignIn(
    private val activity: Activity,
) : GoogleSignInLauncher {
    override suspend fun idToken(serverClientId: String): GoogleSignInResult {
        val request =
            GetCredentialRequest
                .Builder()
                .addCredentialOption(
                    GetGoogleIdOption
                        .Builder()
                        .setServerClientId(serverClientId)
                        .setFilterByAuthorizedAccounts(false)
                        .build(),
                ).build()
        return try {
            val credential = CredentialManager.create(activity).getCredential(activity, request).credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                GoogleSignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                GoogleSignInResult.Failed
            }
        } catch (e: GetCredentialCancellationException) {
            GoogleSignInResult.Cancelled
        } catch (e: NoCredentialException) {
            // No Google account on the phone: say so, rather than a vague failure.
            GoogleSignInResult.NoAccount
        } catch (e: GetCredentialException) {
            GoogleSignInResult.Failed
        }
    }
}
