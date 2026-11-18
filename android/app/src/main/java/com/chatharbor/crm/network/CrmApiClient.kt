package com.chatharbor.crm.network

import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class LoginResult(
    val token: String,
    val userId: String,
    val username: String,
    val tenantId: String,
    val tenantName: String,
    val timezone: String
)

data class CrmRecord(
    val id: String,
    val name: String,
    val type: String, // "lead" or "contact"
    val subtitle: String
)

data class UploadResult(
    val success: Boolean,
    val isAlreadyImported: Boolean,
    val messageCount: Int,
    val skippedCount: Int,
    val message: String
)

class CrmApiClient {

    @Throws(Exception::class)
    fun login(baseUrl: String, username: String, password: String): LoginResult {
        val url = URL("$baseUrl/api/auth/login")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.connectTimeout = 10000
        conn.readTimeout = 10000

        val payload = JSONObject().apply {
            put("username", username)
            put("password", password)
        }

        conn.outputStream.use { os ->
            os.write(payload.toString().toByteArray(StandardCharsets.UTF_8))
        }

        val code = conn.responseCode
        val responseBody = readStream(if (code in 200..299) conn.inputStream else conn.errorStream)

        if (code != 200) {
            val errorMsg = try {
                JSONObject(responseBody).optString("error", "Login failed (code: $code)")
            } catch (_: Exception) {
                "Authentication failed with status $code"
            }
            throw Exception(errorMsg)
        }

        val json = JSONObject(responseBody)
        val token = json.getString("token")
        val userObj = json.getJSONObject("user")
        val tenantObj = json.getJSONObject("tenant")

        return LoginResult(
            token = token,
            userId = userObj.getString("id"),
            username = userObj.getString("username"),
            tenantId = tenantObj.getString("id"),
            tenantName = tenantObj.getString("name"),
            timezone = tenantObj.optString("timezone", "UTC")
        )
    }

    @Throws(Exception::class)
    fun fetchAuthorizedRecords(baseUrl: String, token: String, query: String = ""): List<CrmRecord> {
        val records = mutableListOf<CrmRecord>()

        // Contacts are the primary workflow for ChatHarbor
        val contactsUrl = URL("$baseUrl/api/contacts${if (query.isNotBlank()) "?q=${query.trim()}" else ""}")
        val contactsConn = contactsUrl.openConnection() as HttpURLConnection
        contactsConn.setRequestProperty("Authorization", "Bearer $token")
        contactsConn.connectTimeout = 8000
        contactsConn.readTimeout = 8000

        if (contactsConn.responseCode == 200) {
            val body = readStream(contactsConn.inputStream)
            val json = JSONObject(body)
            val arr = json.getJSONArray("contacts")
            for (i in 0 until arr.length()) {
                val item = arr.getJSONObject(i)
                records.add(
                    CrmRecord(
                        id = item.getString("id"),
                        name = item.getString("name"),
                        type = "contact",
                        subtitle = item.optString("account_name", item.optString("email", "Contact"))
                    )
                )
            }
        }

        return records
    }

    @Throws(Exception::class)
    fun uploadWhatsAppExport(
        baseUrl: String,
        token: String,
        destinationType: String,
        destinationId: String,
        file: File,
        dateFormat: String,
        timezone: String
    ): UploadResult {
        val boundary = "==Boundary-${System.currentTimeMillis()}=="
        val lineEnd = "\r\n"
        val twoHyphens = "--"

        val endpoint = if (destinationType == "lead") {
            "$baseUrl/api/leads/$destinationId/whatsapp-import"
        } else {
            "$baseUrl/api/contacts/$destinationId/whatsapp-import"
        }

        val url = URL(endpoint)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.doOutput = true
        conn.connectTimeout = 15000
        conn.readTimeout = 15000

        DataOutputStream(conn.outputStream).use { dos ->
            // Form field: destinationType
            writeFormField(dos, boundary, "destinationType", destinationType)
            // Form field: destinationId
            writeFormField(dos, boundary, "destinationId", destinationId)
            // Form field: dateFormat
            writeFormField(dos, boundary, "dateFormat", dateFormat)
            // Form field: timezone
            writeFormField(dos, boundary, "timezone", timezone)

            // File field
            dos.writeBytes("$twoHyphens$boundary$lineEnd")
            dos.writeBytes("Content-Disposition: form-data; name=\"file\"; filename=\"${file.name}\"$lineEnd")
            dos.writeBytes("Content-Type: text/plain$lineEnd")
            dos.writeBytes(lineEnd)

            FileInputStream(file).use { fis ->
                val buffer = ByteArray(4096)
                var bytesRead: Int
                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    dos.write(buffer, 0, bytesRead)
                }
            }
            dos.writeBytes(lineEnd)
            dos.writeBytes("$twoHyphens$boundary$twoHyphens$lineEnd")
        }

        val code = conn.responseCode
        val responseBody = readStream(if (code in 200..299) conn.inputStream else conn.errorStream)

        if (code == 413) {
            throw Exception("File size exceeds server limit (5 MB).")
        }
        if (code == 403) {
            throw Exception("Access denied: You do not have permission to import into this record.")
        }
        if (code !in 200..299) {
            val err = try {
                JSONObject(responseBody).optString("error", "Import failed with HTTP $code")
            } catch (_: Exception) {
                "Import failed with HTTP $code: $responseBody"
            }
            throw Exception(err)
        }

        val json = JSONObject(responseBody)
        val isAlreadyImported = json.optString("status") == "already_imported" || json.optBoolean("existing", false)
        val msgCount = json.optInt("messageCount", 0)
        val skippedCount = json.optInt("skippedCount", 0)
        val message = json.optString("message", "Import successful")

        return UploadResult(
            success = true,
            isAlreadyImported = isAlreadyImported,
            messageCount = msgCount,
            skippedCount = skippedCount,
            message = message
        )
    }

    private fun writeFormField(dos: DataOutputStream, boundary: String, name: String, value: String) {
        val lineEnd = "\r\n"
        val twoHyphens = "--"
        dos.writeBytes("$twoHyphens$boundary$lineEnd")
        dos.writeBytes("Content-Disposition: form-data; name=\"$name\"$lineEnd")
        dos.writeBytes(lineEnd)
        dos.write(value.toByteArray(StandardCharsets.UTF_8))
        dos.writeBytes(lineEnd)
    }

    private fun readStream(stream: InputStream?): String {
        if (stream == null) return ""
        return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { it.readText() }
    }
}

