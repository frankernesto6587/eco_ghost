package com.merxbit.ecoghost.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.merxbit.ecoghost.BuildConfig
import com.merxbit.ecoghost.data.net.ApiJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

/** Manifiesto publicado en apk.merxbit.com/ecoghost/ (latest.json o prueba.json según la variante). */
@Serializable
data class AppRelease(
    val versionCode: Int = 0,
    val versionName: String = "",
    val url: String = "",
    val notes: String = "",
)

/** Auto-actualización (copiado de realtime-solar): comprobar, descargar e instalar el APK. */
object Updater {
    private const val APK_NAME = "ecoghost-update.apk"

    fun currentCode(ctx: Context): Int = runCatching {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode.toInt()
        else @Suppress("DEPRECATION") pi.versionCode
    }.getOrDefault(0)

    fun currentName(ctx: Context): String = runCatching {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName
    }.getOrNull() ?: "?"

    /** BLOQUEANTE: llamar en Dispatchers.IO. */
    fun fetch(client: OkHttpClient): AppRelease? {
        val req = Request.Builder().url(BuildConfig.UPDATE_URL).header("Cache-Control", "no-cache").build()
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return null
            val body = r.body?.string() ?: return null
            return runCatching { ApiJson.decodeFromString(AppRelease.serializer(), body) }.getOrNull()
        }
    }

    private fun apkFile(ctx: Context): File =
        File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_NAME)

    fun enqueue(ctx: Context, rel: AppRelease): Long {
        runCatching { apkFile(ctx).takeIf { it.exists() }?.delete() }
        val dm = ctx.getSystemService(DownloadManager::class.java)
        val req = DownloadManager.Request(Uri.parse(rel.url))
            .setTitle("EcoGhost ${rel.versionName}")
            .setDescription("Actualización")
            .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, APK_NAME)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setMimeType("application/vnd.android.package-archive")
        return dm.enqueue(req)
    }

    /** Si falta el permiso de "instalar apps desconocidas", lleva a concederlo y devuelve false. */
    fun install(ctx: Context): Boolean {
        val f = apkFile(ctx)
        if (!f.exists()) return false
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            val s = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { ctx.startActivity(s) }
            return false
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching { ctx.startActivity(intent); true }.getOrDefault(false)
    }
}

/** Al abrir la app: si hay una versión más nueva, la ofrece. */
@Composable
fun UpdatePrompt(client: OkHttpClient) {
    val ctx = LocalContext.current
    var release by remember { mutableStateOf<AppRelease?>(null) }
    var downloadId by remember { mutableStateOf<Long?>(null) }
    var ready by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val rel = withContext(Dispatchers.IO) { runCatching { Updater.fetch(client) }.getOrNull() }
        if (rel != null && rel.versionCode > Updater.currentCode(ctx) && rel.url.isNotBlank()) release = rel
    }

    DisposableEffect(downloadId) {
        val id = downloadId ?: return@DisposableEffect onDispose { }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == id) {
                    ready = true
                    Updater.install(ctx)
                }
            }
        }
        ContextCompat.registerReceiver(
            ctx, receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED,
        )
        onDispose { runCatching { ctx.unregisterReceiver(receiver) } }
    }

    val rel = release ?: return
    AlertDialog(
        onDismissRequest = { if (downloadId == null) release = null },
        title = { Text("Nueva versión ${rel.versionName}") },
        text = {
            Text(
                when {
                    ready -> "Descargada. Si no se abrió el instalador, permite \"instalar apps desconocidas\" y pulsa Instalar."
                    downloadId != null -> "Descargando…"
                    rel.notes.isNotBlank() -> rel.notes
                    else -> "Hay una versión más nueva de EcoGhost."
                },
            )
        },
        confirmButton = {
            TextButton(
                onClick = { if (ready) Updater.install(ctx) else downloadId = Updater.enqueue(ctx, rel) },
                enabled = downloadId == null || ready,
            ) { Text(if (ready) "Instalar" else "Actualizar") }
        },
        dismissButton = { if (downloadId == null) TextButton({ release = null }) { Text("Luego") } },
    )
}
