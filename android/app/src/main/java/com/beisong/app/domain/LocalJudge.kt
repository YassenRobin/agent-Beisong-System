package com.beisong.app.domain

fun judgeLocally(
    expected: String,
    actual: String,
    questionType: String?,
    star: Int?
): JudgeResult {
    val expectedNorm = normalizeAnswer(expected)
    val actualNorm = normalizeAnswer(actual)
    val correct = expectedNorm == actualNorm

    return if (correct) {
        JudgeResult(
            isCorrect = true,
            score = 1.0,
            errorType = null,
            feedback = "回答正确"
        )
    } else {
        JudgeResult(
            isCorrect = false,
            score = 0.0,
            errorType = classifyError(expectedNorm, actualNorm, questionType, star),
            feedback = "答案与标准答案不一致"
        )
    }
}

private fun normalizeAnswer(value: String): String {
    return value
        .replace(Regex("\\s+"), "")
        .replace("，", ",")
        .replace("。", ".")
        .replace("；", ";")
        .replace("：", ":")
        .trim()
}

private fun classifyError(
    expected: String,
    actual: String,
    questionType: String?,
    star: Int?
): String {
    if (actual.isBlank()) return "blank"
    if (expected.length != actual.length) return "length_mismatch"
    return "content_mismatch"
}
