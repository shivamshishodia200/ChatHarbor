package com.chatharbor.crm.ui

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.chatharbor.crm.BuildConfig
import com.chatharbor.crm.R
import com.chatharbor.crm.auth.SessionManager
import com.chatharbor.crm.network.CrmApiClient
import com.chatharbor.crm.network.CrmRecord
import com.chatharbor.crm.parser.DateFormatChoice
import com.chatharbor.crm.parser.ParseResult
import com.chatharbor.crm.parser.WhatsAppChatParser
import com.chatharbor.crm.util.InvalidFileException
import com.chatharbor.crm.util.OversizedFileException
import com.chatharbor.crm.util.SafeFileUtils
import java.io.File
import kotlin.concurrent.thread

class ShareImportActivity : AppCompatActivity() {

    private lateinit var sessionManager: SessionManager
    private val apiClient = CrmApiClient()
    private val parser = WhatsAppChatParser()

    private var tempFile: File? = null
    private var fileContent: String = ""
    private var parseResult: ParseResult? = null
    private var recordsList: List<CrmRecord> = emptyList()

    private lateinit var spinnerDestination: Spinner
    private lateinit var spinnerDateFormat: Spinner
    private lateinit var spinnerTimezone: Spinner
    private lateinit var tvAmbiguousWarning: TextView
    private lateinit var tvMsgCount: TextView
    private lateinit var tvSenderCount: TextView
    private lateinit var tvSkippedCount: TextView
    private lateinit var tvPreviewMessages: TextView
    private lateinit var tvStatusMessage: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var btnCancel: Button
    private lateinit var btnConfirm: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_share_import)

        sessionManager = SessionManager(this)

        // Restrict default session seeding exclusively to debug environment
        if (!sessionManager.isLoggedIn() && BuildConfig.DEBUG) {
            sessionManager.saveSession(
                token = "token-acme-alice-123",
                userId = "user-acme-alice",
                username = "alice",
                tenantId = "tenant-acme",
                tenantName = "Acme Corporation",
                timezone = "America/New_York",
                baseUrl = "http://10.0.2.2:3000"
            )
        }

        bindViews()
        setupSpinners()

        val uri = extractUriFromIntent(intent)
        if (uri == null) {
            Toast.makeText(this, "No valid file received.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        processReceivedUri(uri)
    }

    private fun bindViews() {
        spinnerDestination = findViewById(R.id.spinnerDestination)
        spinnerDateFormat = findViewById(R.id.spinnerDateFormat)
        spinnerTimezone = findViewById(R.id.spinnerTimezone)
        tvAmbiguousWarning = findViewById(R.id.tvAmbiguousWarning)
        tvMsgCount = findViewById(R.id.tvMsgCount)
        tvSenderCount = findViewById(R.id.tvSenderCount)
        tvSkippedCount = findViewById(R.id.tvSkippedCount)
        tvPreviewMessages = findViewById(R.id.tvPreviewMessages)
        tvStatusMessage = findViewById(R.id.tvStatusMessage)
        progressBar = findViewById(R.id.progressBar)
        btnCancel = findViewById(R.id.btnCancel)
        btnConfirm = findViewById(R.id.btnConfirm)

        btnCancel.setOnClickListener {
            // Cancel discards preview and cleans up temporary file without uploading
            SafeFileUtils.cleanupFile(tempFile)
            finish()
        }

        btnConfirm.setOnClickListener {
            confirmAndUpload()
        }
    }

    private fun setupSpinners() {
        val dateFormats = arrayOf("DD/MM/YYYY", "MM/DD/YYYY")
        val dateAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, dateFormats)
        spinnerDateFormat.adapter = dateAdapter

        val timezones = arrayOf(
            sessionManager.getTenantTimezone(),
            "UTC",
            "America/New_York",
            "America/Chicago",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Kolkata",
            "Asia/Tokyo"
        ).distinct()

        val tzAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, timezones)
        spinnerTimezone.adapter = tzAdapter

        spinnerDateFormat.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                reparseAndRefreshPreview()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        spinnerTimezone.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                reparseAndRefreshPreview()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun extractUriFromIntent(intent: Intent?): Uri? {
        if (intent == null) return null
        if (intent.action == Intent.ACTION_SEND) {
            val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (uri != null) return uri
        }
        return intent.data
    }

    private fun processReceivedUri(uri: Uri) {
        progressBar.visibility = View.VISIBLE
        tvStatusMessage.visibility = View.GONE

        thread {
            try {
                // Defensive file handling & 5MB limit
                val file = SafeFileUtils.copyUriToTempFile(this, uri)
                tempFile = file
                fileContent = file.readText(Charsets.UTF_8)

                // Fetch authorized records for tenant
                val records = apiClient.fetchAuthorizedRecords(
                    sessionManager.getBaseUrl(),
                    sessionManager.getToken() ?: ""
                )
                recordsList = records

                runOnUiThread {
                    progressBar.visibility = View.GONE
                    populateRecordsSpinner()
                    reparseAndRefreshPreview()
                }
            } catch (e: OversizedFileException) {
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    showErrorDialog("Oversized File", e.message ?: "File exceeds 5 MB limit.")
                }
            } catch (e: InvalidFileException) {
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    showErrorDialog("Invalid File", e.message ?: "Invalid WhatsApp export file.")
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    showErrorDialog("Error", "Could not process shared file: ${e.message}")
                }
            }
        }
    }

    private fun populateRecordsSpinner() {
        if (recordsList.isEmpty()) {
            val emptyAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, arrayOf("No contacts found"))
            spinnerDestination.adapter = emptyAdapter
            btnConfirm.isEnabled = false
            return
        }

        val displayList = recordsList.map { "${it.name} - ${it.subtitle}" }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, displayList)
        spinnerDestination.adapter = adapter
        btnConfirm.isEnabled = true
    }

    private fun reparseAndRefreshPreview() {
        if (fileContent.isBlank()) return

        val selectedFormatStr = spinnerDateFormat.selectedItem as? String ?: "DD/MM/YYYY"
        val formatChoice = if (selectedFormatStr == "MM/DD/YYYY") DateFormatChoice.MM_DD_YYYY else DateFormatChoice.DD_MM_YYYY
        val timezone = spinnerTimezone.selectedItem as? String ?: "UTC"

        val result = parser.parse(fileContent, formatChoice, timezone)
        parseResult = result

        tvMsgCount.text = result.messageCount.toString()
        tvSenderCount.text = result.senderLabels.size.toString()
        tvSkippedCount.text = result.skippedCount.toString()

        if (result.isDateAmbiguous) {
            tvAmbiguousWarning.visibility = View.VISIBLE
        } else {
            tvAmbiguousWarning.visibility = View.GONE
        }

        // Show first 15 messages in preview
        val previewBuilder = StringBuilder()
        val previewItems = result.messages.take(15)
        for (msg in previewItems) {
            previewBuilder.append("[${msg.originalTimestamp}] ${msg.sender}:\n")
            previewBuilder.append(msg.messageText).append("\n\n")
        }
        if (result.messages.size > 15) {
            previewBuilder.append("... and ${result.messages.size - 15} more messages.")
        }
        tvPreviewMessages.text = previewBuilder.toString()
    }

    private fun confirmAndUpload() {
        val selectedIndex = spinnerDestination.selectedItemPosition
        if (selectedIndex < 0 || selectedIndex >= recordsList.size) {
            Toast.makeText(this, "Please select a destination record.", Toast.LENGTH_SHORT).show()
            return
        }

        val targetRecord = recordsList[selectedIndex]
        val file = tempFile
        if (file == null || !file.exists()) {
            Toast.makeText(this, "Export file missing. Please re-share.", Toast.LENGTH_SHORT).show()
            return
        }

        val dateFormat = spinnerDateFormat.selectedItem.toString()
        val timezone = spinnerTimezone.selectedItem.toString()

        progressBar.visibility = View.VISIBLE
        btnConfirm.isEnabled = false
        btnCancel.isEnabled = false
        tvStatusMessage.visibility = View.GONE

        thread {
            try {
                val uploadResult = apiClient.uploadWhatsAppExport(
                    sessionManager.getBaseUrl(),
                    sessionManager.getToken() ?: "",
                    targetRecord.type,
                    targetRecord.id,
                    file,
                    dateFormat,
                    timezone
                )

                runOnUiThread {
                    progressBar.visibility = View.GONE
                    SafeFileUtils.cleanupFile(tempFile)

                    val title = if (uploadResult.isAlreadyImported) "Already Imported" else "Import Succeeded"
                    val msg = if (uploadResult.isAlreadyImported) {
                        "This WhatsApp conversation was already imported previously. Timeline is up-to-date."
                    } else {
                        "Successfully imported ${uploadResult.messageCount} messages (${uploadResult.skippedCount} skipped)."
                    }

                    AlertDialog.Builder(this)
                        .setTitle(title)
                        .setMessage(msg)
                        .setPositiveButton("Done") { _, _ -> finish() }
                        .setCancelable(false)
                        .show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    btnConfirm.isEnabled = true
                    btnCancel.isEnabled = true
                    btnConfirm.text = "Retry Import"
                    tvStatusMessage.visibility = View.VISIBLE
                    tvStatusMessage.text = "Upload failed: ${e.message}"
                }
            }
        }
    }

    private fun showErrorDialog(title: String, message: String) {
        SafeFileUtils.cleanupFile(tempFile)
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("Close") { _, _ -> finish() }
            .setCancelable(false)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        SafeFileUtils.cleanupFile(tempFile)
    }
}

