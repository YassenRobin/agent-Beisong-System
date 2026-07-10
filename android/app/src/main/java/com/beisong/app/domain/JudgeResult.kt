package com.beisong.app.domain

data class JudgeResult(
    val isCorrect: Boolean,
    val score: Double,
    val errorType: String?,
    val feedback: String
)
