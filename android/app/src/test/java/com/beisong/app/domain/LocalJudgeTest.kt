package com.beisong.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalJudgeTest {
    @Test
    fun exactAnswerIsCorrect() {
        val result = judgeLocally(
            expected = "海内存知己",
            actual = "海内存知己",
            questionType = "blank",
            star = 2
        )

        assertTrue(result.isCorrect)
        assertEquals(1.0, result.score, 0.0001)
    }

    @Test
    fun normalizedWhitespaceIsCorrect() {
        val result = judgeLocally(
            expected = "天涯若比邻",
            actual = " 天涯 若 比邻 ",
            questionType = "blank",
            star = 2
        )

        assertTrue(result.isCorrect)
    }

    @Test
    fun differentAnswerIsWrong() {
        val result = judgeLocally(
            expected = "无边落木萧萧下",
            actual = "不尽长江滚滚来",
            questionType = "blank",
            star = 3
        )

        assertEquals(false, result.isCorrect)
        assertEquals("content_mismatch", result.errorType)
    }
}
