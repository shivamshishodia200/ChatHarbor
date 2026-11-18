package com.chatharbor.crm

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.chatharbor.crm.auth.SessionManager
import com.chatharbor.crm.ui.ShareImportActivity

class MainActivity : AppCompatActivity() {

    private lateinit var sessionManager: SessionManager

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            val intent = Intent(this, ShareImportActivity::class.java).apply {
                data = uri
            }
            startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sessionManager = SessionManager(this)

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

        val tvUserSession = findViewById<TextView>(R.id.tvUserSession)
        val btnSignOut = findViewById<Button>(R.id.btnSignOut)
        val btnPickFile = findViewById<Button>(R.id.btnPickFile)

        tvUserSession.text = "Signed in as: Alice Smith (Acme Corporation)"

        btnSignOut.setOnClickListener {
            // Toggle between Acme and Globex for easy mobile testing
            if (sessionManager.getToken() == "token-acme-alice-123") {
                sessionManager.saveSession(
                    token = "token-globex-hank-456",
                    userId = "user-globex-hank",
                    username = "hank",
                    tenantId = "tenant-globex",
                    tenantName = "Globex Corporation",
                    timezone = "Europe/London",
                    baseUrl = "http://10.0.2.2:3000"
                )
                tvUserSession.text = "Signed in as: Hank Scorpio (Globex Corporation)"
            } else {
                sessionManager.saveSession(
                    token = "token-acme-alice-123",
                    userId = "user-acme-alice",
                    username = "alice",
                    tenantId = "tenant-acme",
                    tenantName = "Acme Corporation",
                    timezone = "America/New_York",
                    baseUrl = "http://10.0.2.2:3000"
                )
                tvUserSession.text = "Signed in as: Alice Smith (Acme Corporation)"
            }
        }

        btnPickFile.setOnClickListener {
            filePickerLauncher.launch(arrayOf("text/plain", "*/*"))
        }
    }
}

