package com.chatharbor.crm.parser

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

enum class DateFormatChoice {
    DD_MM_YYYY,
    MM_DD_YYYY,
    YYYY_MM_DD
}

data class WhatsAppMessage(
    val id: String,
    val sender: String,
    val messageText: String,
    val originalTimestamp: String,
    val timestampUtc: String,
    val sequenceOrder: Int
)

data class SkippedLineInfo(
    val lineNumber: Int,
    val preview: String,
    val reason: String
)

data class ParseResult(
    val messages: List<WhatsAppMessage>,
    val messageCount: Int,
    val skippedCount: Int,
    val skippedLines: List<SkippedLineInfo>,
    val senderLabels: List<String>,
    val dateRangeStart: String?,
    val dateRangeEnd: String?,
    val detectedDateFormat: DateFormatChoice,
    val isDateAmbiguous: Boolean = false,
    val timezone: String
)

class WhatsAppChatParser {

    companion object {
        private val ANDROID_HEADER_REGEX = Pattern.compile(
            """^(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\s*-\s*(.*)$"""
        )
        private val IOS_HEADER_REGEX = Pattern.compile(
            """^\[(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]\s*(.*)$"""
        )

        fun cleanText(input: String): String {
            return input
                .replace("\uFEFF", "") // Strip BOM
                .replace("[\u200E\u200F\u202A-\u202E]".toRegex(), "") // Strip direction marks
                .replace("[\u00A0\u202F]".toRegex(), " ") // Normalize spaces
        }
    }

    fun parse(
        content: String,
        specifiedFormat: DateFormatChoice? = null,
        timezone: String = "UTC"
    ): ParseResult {
        val cleaned = cleanText(content)
        if (cleaned.isBlank()) {
            return ParseResult(
                messages = emptyList(),
                messageCount = 0,
                skippedCount = 0,
                skippedLines = emptyList(),
                senderLabels = emptyList(),
                dateRangeStart = null,
                dateRangeEnd = null,
                detectedDateFormat = specifiedFormat ?: DateFormatChoice.DD_MM_YYYY,
                isDateAmbiguous = false,
                timezone = timezone
            )
        }

        val lines = cleaned.lines()
        val (detectedFormat, isAmbiguous) = detectAmbiguity(lines, specifiedFormat)
        val activeFormat = specifiedFormat ?: detectedFormat

        val messages = mutableListOf<WhatsAppMessage>()
        val skippedLines = mutableListOf<SkippedLineInfo>()
        val sendersSet = linkedSetOf<String>()

        var currentMessage: WhatsAppMessage? = null
        var sequence = 0

        for ((index, line) in lines.withIndex()) {
            val lineNumber = index + 1
            val trimmed = line.trim()

            if (trimmed.isEmpty()) {
                if (currentMessage != null) {
                    val updated = currentMessage.copy(messageText = currentMessage.messageText + "\n")
                    messages[messages.size - 1] = updated
                    currentMessage = updated
                } else {
                    skippedLines.add(
                        SkippedLineInfo(lineNumber, "(empty line)", "empty_line")
                    )
                }
                continue
            }

            val androidMatcher = ANDROID_HEADER_REGEX.matcher(trimmed)
            val iosMatcher = IOS_HEADER_REGEX.matcher(trimmed)

            val isHeader = androidMatcher.matches() || iosMatcher.matches()
            val matcher = if (androidMatcher.matches()) androidMatcher else iosMatcher

            if (isHeader) {
                val dateStr = matcher.group(1) ?: ""
                val timeStr = matcher.group(2) ?: ""
                val payload = matcher.group(3) ?: ""

                val colonIndex = payload.indexOf(": ")
                if (colonIndex == -1) {
                    // System message
                    val preview = if (payload.length > 80) payload.substring(0, 80) + "..." else payload
                    skippedLines.add(SkippedLineInfo(lineNumber, preview, "system_message"))
                    currentMessage = null
                    continue
                }

                val sender = payload.substring(0, colonIndex).trim()
                val messageBody = payload.substring(colonIndex + 2)

                try {
                    val (timestampUtc, originalTimestamp) = parseDateTime(
                        dateStr,
                        timeStr,
                        activeFormat,
                        timezone
                    )

                    sequence++
                    val msg = WhatsAppMessage(
                        id = "msg-$sequence",
                        sender = sender,
                        messageText = messageBody,
                        originalTimestamp = originalTimestamp,
                        timestampUtc = timestampUtc,
                        sequenceOrder = sequence
                    )

                    messages.add(msg)
                    sendersSet.add(sender)
                    currentMessage = msg
                } catch (e: Exception) {
                    val preview = if (trimmed.length > 80) trimmed.substring(0, 80) + "..." else trimmed
                    skippedLines.add(SkippedLineInfo(lineNumber, preview, "malformed_line"))
                    currentMessage = null
                }
            } else {
                if (currentMessage != null) {
                    val updated = currentMessage.copy(
                        messageText = currentMessage.messageText + "\n" + line
                    )
                    messages[messages.size - 1] = updated
                    currentMessage = updated
                } else {
                    val preview = if (trimmed.length > 80) trimmed.substring(0, 80) + "..." else trimmed
                    skippedLines.add(SkippedLineInfo(lineNumber, preview, "leading_garbage"))
                }
            }
        }

        var start: String? = null
        var end: String? = null
        if (messages.isNotEmpty()) {
            val sorted = messages.sortedBy { it.timestampUtc }
            start = sorted.first().timestampUtc
            end = sorted.last().timestampUtc
        }

        return ParseResult(
            messages = messages,
            messageCount = messages.size,
            skippedCount = skippedLines.size,
            skippedLines = skippedLines,
            senderLabels = sendersSet.toList(),
            dateRangeStart = start,
            dateRangeEnd = end,
            detectedDateFormat = activeFormat,
            isDateAmbiguous = isAmbiguous,
            timezone = timezone
        )
    }

    private fun detectAmbiguity(
        lines: List<String>,
        userChoice: DateFormatChoice?
    ): Pair<DateFormatChoice, Boolean> {
        var sawD1Greater12 = false
        var sawD2Greater12 = false
        var sawHeader = false

        for (line in lines) {
            val trimmed = cleanText(line).trim()
            val m = ANDROID_HEADER_REGEX.matcher(trimmed)
            val isMatch = m.matches() || IOS_HEADER_REGEX.matcher(trimmed).matches()
            val activeMatcher = if (m.matches()) m else IOS_HEADER_REGEX.matcher(trimmed)
            if (isMatch && activeMatcher.matches()) {
                sawHeader = true
                val dateStr = activeMatcher.group(1) ?: continue
                val parts = dateStr.split("""[/.-]""".toRegex()).mapNotNull { it.toIntOrNull() }
                if (parts.size == 3) {
                    if (parts[0] > 12) sawD1Greater12 = true
                    if (parts[1] > 12) sawD2Greater12 = true
                }
            }
        }

        if (sawD1Greater12 && !sawD2Greater12) {
            return Pair(DateFormatChoice.DD_MM_YYYY, false)
        }
        if (sawD2Greater12 && !sawD1Greater12) {
            return Pair(DateFormatChoice.MM_DD_YYYY, false)
        }

        return Pair(
            userChoice ?: DateFormatChoice.DD_MM_YYYY,
            sawHeader && !sawD1Greater12 && !sawD2Greater12
        )
    }

    private fun parseDateTime(
        dateStr: String,
        timeStr: String,
        format: DateFormatChoice,
        timezone: String
    ): Pair<String, String> {
        val originalTimestamp = "$dateStr, $timeStr".trim()
        val parts = dateStr.split("""[/.-]""".toRegex()).map { it.toInt() }
        if (parts.size != 3) {
            throw IllegalArgumentException("Invalid date: $dateStr")
        }

        val year: Int
        val month: Int
        val day: Int

        if (parts[0] > 1000) {
            year = parts[0]
            month = parts[1]
            day = parts[2]
        } else if (format == DateFormatChoice.MM_DD_YYYY) {
            month = parts[0]
            day = parts[1]
            year = parts[2]
        } else {
            day = parts[0]
            month = parts[1]
            year = parts[2]
        }

        val fullYear = if (year < 100) (if (year < 70) 2000 + year else 1900 + year) else year

        val cleanTime = timeStr.trim().replace("""\s+""".toRegex(), " ")
        val isAmPm = cleanTime.endsWith("AM", ignoreCase = true) || cleanTime.endsWith("PM", ignoreCase = true)
        val isPm = cleanTime.endsWith("PM", ignoreCase = true)
        val timeTokens = cleanTime.replace("""(?i)\s*[ap]m$""".toRegex(), "")
            .split(":")
            .map { it.toInt() }

        var hour = timeTokens[0]
        val minute = if (timeTokens.size > 1) timeTokens[1] else 0
        val second = if (timeTokens.size > 2) timeTokens[2] else 0

        if (isAmPm) {
            if (isPm && hour < 12) hour += 12
            if (!isPm && hour == 12) hour = 0
        }

        val zoneId = try {
            ZoneId.of(timezone)
        } catch (e: Exception) {
            ZoneId.of("UTC")
        }

        val localDateTime = LocalDateTime.of(fullYear, month, day, hour, minute, second)
        val zonedDateTime = localDateTime.atZone(zoneId)
        val utcZoned = zonedDateTime.withZoneSameInstant(ZoneId.of("UTC"))
        val timestampUtc = utcZoned.format(DateTimeFormatter.ISO_INSTANT)

        return Pair(timestampUtc, originalTimestamp)
    }
}
