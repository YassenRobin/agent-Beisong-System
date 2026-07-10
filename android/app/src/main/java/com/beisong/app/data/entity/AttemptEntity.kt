package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "attempts")
data class AttemptEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "user_id") val userId: String?,
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "user_answer") val userAnswer: String?,
    @ColumnInfo(name = "is_correct") val isCorrect: Int?,
    val score: Double?,
    @ColumnInfo(name = "error_type") val errorType: String?,
    val feedback: String?,
    @ColumnInfo(name = "created_at") val createdAt: String?
)
