package com.chatharbor.crm.auth

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("crm_session_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_TOKEN = "api_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USERNAME = "username"
        private const val KEY_TENANT_ID = "tenant_id"
        private const val KEY_TENANT_NAME = "tenant_name"
        private const val KEY_TENANT_TIMEZONE = "tenant_timezone"
        private const val KEY_BASE_URL = "base_url"
    }

    fun saveSession(
        token: String,
        userId: String,
        username: String,
        tenantId: String,
        tenantName: String,
        timezone: String,
        baseUrl: String
    ) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USERNAME, username)
            .putString(KEY_TENANT_ID, tenantId)
            .putString(KEY_TENANT_NAME, tenantName)
            .putString(KEY_TENANT_TIMEZONE, timezone)
            .putString(KEY_BASE_URL, baseUrl)
            .apply()
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun isLoggedIn(): Boolean = !getToken().isNullOrBlank()

    fun getTenantTimezone(): String = prefs.getString(KEY_TENANT_TIMEZONE, "UTC") ?: "UTC"

    fun getBaseUrl(): String = prefs.getString(KEY_BASE_URL, "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000"

    fun setBaseUrl(url: String) {
        prefs.edit().putString(KEY_BASE_URL, url).apply()
    }

    fun clearSession() {
        prefs.edit().clear().apply()
    }
}

