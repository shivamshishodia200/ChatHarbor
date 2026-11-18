package com.chatharbor.crm

import com.chatharbor.crm.parser.DateFormatChoice
import com.chatharbor.crm.parser.WhatsAppChatParser
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class WhatsAppChatParserTest {

    private val parser = WhatsAppChatParser()
    private val fixturesDir = File("../../fixtures")

    @Test
    fun testAndroid12HourExport() {
        val file = File(fixturesDir, "android_12h_sample.txt")
        val content = if (file.exists()) file.readText() else """
            12/31/20, 11:58 PM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
            12/31/20, 11:59 PM - Alice Smith: Hi Bob! Happy New Year's Eve! 🎆
            1/1/21, 12:01 AM - Bob Jones: Happy New Year Alice! Let's close the CRM deal.
        """.trimIndent()

        val result = parser.parse(content, DateFormatChoice.MM_DD_YYYY, "America/New_York")
        assertEquals(2, result.messageCount)
        assertEquals(1, result.skippedCount) // encryption notice skipped
        assertEquals(listOf("Alice Smith", "Bob Jones"), result.senderLabels)
        assertEquals("Alice Smith", result.messages[0].sender)
        assertTrue(result.messages[0].messageText.contains("🎆"))
        assertEquals("12/31/20, 11:59 PM", result.messages[0].originalTimestamp)
    }

    @Test
    fun testAndroid24HourExport() {
        val file = File(fixturesDir, "android_24h_sample.txt")
        val content = if (file.exists()) file.readText() else """
            15/01/2024, 09:30:15 - John Sales: Good morning, reviewing the ChatHarbor proposal.
            15/01/2024, 09:31:00 - Jane Client: Looks good, can we schedule a demo?
            15/01/2024, 09:32 - John Sales: Absolutely! How about 2 PM?
        """.trimIndent()

        val result = parser.parse(content, DateFormatChoice.DD_MM_YYYY, "UTC")
        assertEquals(3, result.messageCount)
        assertEquals(0, result.skippedCount)
        assertEquals("John Sales", result.messages[0].sender)
        assertEquals("Jane Client", result.messages[1].sender)
    }

    @Test
    fun testIosBracketedExport() {
        val file = File(fixturesDir, "ios_bracketed_sample.txt")
        val content = if (file.exists()) file.readText() else """
            [20/03/2024, 14:15:30] Messages and calls are end-to-end encrypted.
            [20/03/2024, 14:16:00] Dr. Evelyn Reed: The patient records are ready for import.
            [20/03/2024, 14:18:25] Mark Spencer: Excellent, we'll sync them with ChatHarbor.
        """.trimIndent()

        val result = parser.parse(content, DateFormatChoice.DD_MM_YYYY, "UTC")
        assertEquals(2, result.messageCount)
        assertEquals(1, result.skippedCount)
        assertEquals("Dr. Evelyn Reed", result.messages[0].sender)
    }

    @Test
    fun testMultilineAndEmojiExport() {
        val file = File(fixturesDir, "multiline_emoji_sample.txt")
        val content = if (file.exists()) file.readText() else """
            [15/05/2024, 10:00:00 AM] Alice Smith: Here is the requirement breakdown:
            1. Multi-tenant security
            2. WhatsApp chat import
            3. Android companion app
            Let me know what you think! 🚀
            [15/05/2024, 10:05:00 AM] Bob Jones: Looks solid!
            Let's get started right away. 💻👍
        """.trimIndent()

        val result = parser.parse(content, DateFormatChoice.DD_MM_YYYY, "UTC")
        assertEquals(2, result.messageCount)
        assertTrue(result.messages[0].messageText.contains("1. Multi-tenant security"))
        assertTrue(result.messages[0].messageText.contains("🚀"))
        assertTrue(result.messages[1].messageText.contains("💻👍"))
    }

    @Test
    fun testAmbiguousDatesDetection() {
        val file = File(fixturesDir, "ambiguous_dates_sample.txt")
        val content = if (file.exists()) file.readText() else """
            05/06/2024, 10:00 - Alice Smith: Is this May 6th or June 5th?
            05/06/2024, 10:05 - Bob Jones: We need the date format selector to disambiguate!
        """.trimIndent()

        val result = parser.parse(content, null, "UTC")
        assertTrue("Expected ambiguous date detection to be true", result.isDateAmbiguous)
    }

    @Test
    fun testSystemMessagesAreSkipped() {
        val file = File(fixturesDir, "system_messages_sample.txt")
        val content = if (file.exists()) file.readText() else """
            10/04/2024, 11:00 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
            10/04/2024, 11:01 AM - Alice Smith: Hello team!
            10/04/2024, 11:02 AM - Bob Jones: <Media omitted>
            10/04/2024, 11:03 AM - Alice Smith changed the subject to "ChatHarbor Launch"
            10/04/2024, 11:05 AM - Missed voice call
            10/04/2024, 11:06 AM - Alice Smith: Call me back when you're free.
        """.trimIndent()

        val result = parser.parse(content, DateFormatChoice.DD_MM_YYYY, "UTC")
        assertEquals(3, result.messageCount)
        assertEquals(3, result.skippedCount)
    }

    @Test
    fun testEmptyExport() {
        val result = parser.parse("", DateFormatChoice.DD_MM_YYYY, "UTC")
        assertEquals(0, result.messageCount)
        assertEquals(0, result.skippedCount)
    }
}

