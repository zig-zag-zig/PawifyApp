package vip.pawify.googlesignin

import android.app.Activity
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.util.concurrent.Executor

class GoogleSignInModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val credentialManager = CredentialManager.create(reactApplicationContext)
    private val mainExecutor = Executor { command -> Handler(Looper.getMainLooper()).post(command) }

    private var clientId: String? = null
    private var currentPromise: Promise? = null
    private var currentCancellationSignal: CancellationSignal? = null

    override fun getName(): String = "GoogleSignInModule"

    @ReactMethod
    fun init(clientId: String) {
        this.clientId = clientId.trim()
    }

    @ReactMethod
    fun signIn(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity is not available.")
            return
        }

        val serverClientId = clientId
        if (serverClientId.isNullOrBlank()) {
            promise.reject("NOT_INITIALIZED", "Google sign-in has not been initialized.")
            return
        }

        if (currentPromise != null) {
            promise.reject("SIGNIN_IN_PROGRESS", "Google sign-in is already in progress.")
            return
        }

        currentPromise = promise
        requestGoogleSignInCredential(
            activity = activity,
            serverClientId = serverClientId,
        )
    }

    @ReactMethod
    fun signOut(promise: Promise) {
        credentialManager.clearCredentialStateAsync(
            ClearCredentialStateRequest(),
            null,
            mainExecutor,
            object : CredentialManagerCallback<Void?, ClearCredentialException> {
                override fun onResult(result: Void?) {
                    promise.resolve(null)
                }

                override fun onError(e: ClearCredentialException) {
                    promise.reject("SIGNOUT_FAILED", "Google sign-out failed.", e)
                }
            },
        )
    }

    override fun invalidate() {
        currentCancellationSignal?.cancel()
        clearCurrentRequest()
        super.invalidate()
    }

    private fun requestGoogleSignInCredential(
        activity: Activity,
        serverClientId: String,
    ) {
        val signInWithGoogleOption =
            GetSignInWithGoogleOption
                .Builder(serverClientId)
                .build()

        val request =
            GetCredentialRequest
                .Builder()
                .addCredentialOption(signInWithGoogleOption)
                .build()

        val cancellationSignal = CancellationSignal()
        currentCancellationSignal = cancellationSignal

        credentialManager.getCredentialAsync(
            activity,
            request,
            cancellationSignal,
            mainExecutor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    handleCredentialResult(result)
                }

                override fun onError(e: GetCredentialException) {
                    rejectCredentialError(e)
                }
            },
        )
    }

    private fun handleCredentialResult(result: GetCredentialResponse) {
        val credential = result.credential
        if (
            credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            rejectAndClear("UNSUPPORTED_CREDENTIAL", "Google sign-in returned an unsupported credential.")
            return
        }

        try {
            val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
            val idToken = googleCredential.idToken
            if (idToken.isBlank()) {
                rejectAndClear("MISSING_ID_TOKEN", "Google sign-in did not return an ID token.")
                return
            }

            val response = Arguments.createMap()
            response.putString("idToken", idToken)
            response.putString("email", googleCredential.id)
            response.putString("displayName", googleCredential.displayName)
            response.putString("name", googleCredential.displayName)
            response.putString("providerId", "google.com")

            resolveAndClear(response)
        } catch (e: GoogleIdTokenParsingException) {
            rejectAndClear("INVALID_ID_TOKEN", "Google sign-in returned an invalid ID token.", e)
        }
    }

    private fun rejectCredentialError(e: GetCredentialException) {
        when (e) {
            is GetCredentialCancellationException ->
                rejectAndClear("USER_CANCELLED", "Google sign-in was cancelled.", e)

            is NoCredentialException ->
                rejectAndClear("NO_CREDENTIAL", "No Google account is available on this device.", e)

            is GetCredentialProviderConfigurationException ->
                rejectAndClear(
                    "PROVIDER_CONFIGURATION_ERROR",
                    "Google sign-in is not configured correctly for this Android build.",
                    e,
                )

            is GetCredentialUnsupportedException ->
                rejectAndClear("UNSUPPORTED_DEVICE", "Google sign-in is not supported on this device.", e)

            is GetCredentialInterruptedException ->
                rejectAndClear("SIGNIN_INTERRUPTED", "Google sign-in was interrupted. Please try again.", e)

            is GetCredentialUnknownException ->
                rejectAndClear("SIGNIN_FAILED", "Google sign-in failed with an unknown native error.", e)

            else ->
                rejectAndClear("SIGNIN_FAILED", "Google sign-in failed.", e)
        }
    }

    private fun resolveAndClear(value: Any?) {
        val promise = currentPromise
        clearCurrentRequest()
        promise?.resolve(value)
    }

    private fun rejectAndClear(
        code: String,
        message: String,
        throwable: Throwable? = null,
    ) {
        val promise = currentPromise
        clearCurrentRequest()
        if (throwable == null) {
            promise?.reject(code, message)
        } else {
            promise?.reject(code, message, throwable)
        }
    }

    private fun clearCurrentRequest() {
        currentCancellationSignal = null
        currentPromise = null
    }
}
