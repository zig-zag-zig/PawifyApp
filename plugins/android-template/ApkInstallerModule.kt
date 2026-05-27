package vip.pawify.googlesignin

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ApkInstallerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "ApkInstallerModule"

    @ReactMethod
    fun canRequestPackageInstalls(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
                return
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "PACKAGE_INSTALL_PERMISSION_ERROR",
                "Failed to check package install permission: ${e.message ?: "Unknown error"}",
            )
        }
    }

    @ReactMethod
    fun openInstallPermissionSettings(promise: Promise) {
        try {
            val intent =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${reactContext.packageName}"),
                    )
                } else {
                    Intent(Settings.ACTION_SECURITY_SETTINGS)
                }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val fallbackIntent =
                    Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                reactContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (fallbackError: Exception) {
                promise.reject(
                    "OPEN_INSTALL_SETTINGS_ERROR",
                    "Failed to open install settings: ${fallbackError.message ?: e.message ?: "Unknown error"}",
                )
            }
        }
    }

    @ReactMethod
    fun installApk(
        contentUri: String,
        promise: Promise,
    ) {
        if (contentUri.isBlank()) {
            promise.reject("INVALID_INPUT", "APK URI is required")
            return
        }

        try {
            val intent =
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.parse(contentUri), "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "INSTALL_APK_ERROR",
                "Failed to open APK installer: ${e.message ?: "Unknown error"}",
            )
        }
    }
}
