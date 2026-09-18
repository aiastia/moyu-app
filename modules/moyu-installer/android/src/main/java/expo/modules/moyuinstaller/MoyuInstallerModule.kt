package expo.modules.moyuinstaller

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** 应用内自更新：把下载到 cache 的 APK 通过 FileProvider 交给系统包安装器 */
class MoyuInstallerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MoyuInstaller")

    // Android 8.0+ 逐应用授权「允许安装未知应用」；以下版本默认可装
    Function("canRequestInstall") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    AsyncFunction("openInstallPermissionSettings") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "应用上下文未就绪", null)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(true)
        return@AsyncFunction
      }
      try {
        val intent = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: ActivityNotFoundException) {
        promise.reject("ERR_NO_SETTINGS_ACTIVITY", "本系统没有安装来源设置页", e)
      }
    }

    AsyncFunction("installApk") { path: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "应用上下文未就绪", null)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
        promise.reject("ERR_NO_INSTALL_PERMISSION", "尚未获得「安装未知应用」授权", null)
        return@AsyncFunction
      }
      try {
        val filePath = Uri.parse(path).path ?: path.removePrefix("file://")
        val file = File(filePath)
        if (!file.exists()) {
          promise.reject("ERR_APK_MISSING", "安装包不存在（可能已被系统清理）", null)
          return@AsyncFunction
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.moyuupdate.provider", file)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_INSTALL_FAILED", e.message ?: "拉起系统安装器失败", e)
      }
    }
  }
}
