package vip.pawify.googlesignin

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class GoogleAccountPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            GOOGLE_SIGN_IN_MODULE -> GoogleSignInModule(reactContext)
            APK_INSTALLER_MODULE -> ApkInstallerModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        val moduleInfo =
            mapOf(
                GOOGLE_SIGN_IN_MODULE to ReactModuleInfo(
                    GOOGLE_SIGN_IN_MODULE,
                    GoogleSignInModule::class.java.name,
                    false,
                    false,
                    false,
                    false,
                ),
                APK_INSTALLER_MODULE to ReactModuleInfo(
                    APK_INSTALLER_MODULE,
                    ApkInstallerModule::class.java.name,
                    false,
                    false,
                    false,
                    false,
                ),
            )

        return ReactModuleInfoProvider { moduleInfo }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()

    companion object {
        private const val GOOGLE_SIGN_IN_MODULE = "GoogleSignInModule"
        private const val APK_INSTALLER_MODULE = "ApkInstallerModule"
    }
}
