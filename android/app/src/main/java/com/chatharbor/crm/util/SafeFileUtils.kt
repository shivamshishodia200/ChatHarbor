package com.chatharbor.crm.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

class OversizedFileException(message: String) : Exception(message)
class InvalidFileException(message: String) : Exception(message)

object SafeFileUtils {
    const val MAX_FILE_SIZE_BYTES: Long = 5 * 1024 * 1024 // 5 MB Limit

    /**
     * Defensively reads a content:// or file:// URI into an app-private temporary cache file.
     * Enforces the 5 MB limit strictly before or during streaming.
     */
    @Throws(OversizedFileException::class, InvalidFileException::class, IOException::class)
    fun copyUriToTempFile(context: Context, uri: Uri): File {
        val contentResolver = context.contentResolver

        // Check declared size from metadata if available
        var sizeEstimate: Long = -1
        try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (sizeIndex != -1) {
                        sizeEstimate = cursor.getLong(sizeIndex)
                    }
                }
            }
        } catch (_: Exception) {}

        if (sizeEstimate > MAX_FILE_SIZE_BYTES) {
            throw OversizedFileException("File size exceeds 5 MB limit (declared: ${sizeEstimate / (1024 * 1024)} MB).")
        }

        val cacheDir = File(context.cacheDir, "whatsapp_imports")
        if (!cacheDir.exists()) {
            cacheDir.mkdirs()
        }

        val tempFile = File(cacheDir, "shared_export_${System.currentTimeMillis()}.txt")

        contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(tempFile).use { output ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var totalBytes: Long = 0

                while (input.read(buffer).also { bytesRead = it } != -1) {
                    totalBytes += bytesRead
                    if (totalBytes > MAX_FILE_SIZE_BYTES) {
                        tempFile.delete()
                        throw OversizedFileException("File size exceeded 5 MB limit during streaming.")
                    }
                    output.write(buffer, 0, bytesRead)
                }
            }
        } ?: throw IOException("Unable to open input stream for shared URI.")

        if (tempFile.length() == 0L) {
            tempFile.delete()
            throw InvalidFileException("The shared export file is empty.")
        }

        // Validate text content (no binary null bytes in first 1KB)
        FileInputStream(tempFile).use { fis ->
            val sample = ByteArray(1024.coerceAtMost(tempFile.length().toInt()))
            val read = fis.read(sample)
            for (i in 0 until read) {
                if (sample[i].toInt() == 0) {
                    tempFile.delete()
                    throw InvalidFileException("The shared file appears to be binary or corrupted.")
                }
            }
        }

        return tempFile
    }

    /**
     * Completely cleans up temporary import files from cacheDir.
     */
    fun cleanupTempFiles(context: Context) {
        try {
            val cacheDir = File(context.cacheDir, "whatsapp_imports")
            if (cacheDir.exists() && cacheDir.isDirectory) {
                cacheDir.listFiles()?.forEach { it.delete() }
            }
        } catch (_: Exception) {}
    }

    fun cleanupFile(file: File?) {
        try {
            file?.delete()
        } catch (_: Exception) {}
    }
}

