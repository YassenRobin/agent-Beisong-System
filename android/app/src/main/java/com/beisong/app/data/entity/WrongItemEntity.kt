package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "wrong_items")
data class WrongItemEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "user_id") val userId: String?,
    @ColumnInfo(name = "text_id") val textId: String?,
    @ColumnInfo(name = "question_id") val questionId: String,
    val expected: String?,
    val actual: String?,
    @ColumnInfo(name = "error_type") val errorType: String?,
    val count: Int = 1,
    val status: String = "active",
    @ColumnInfo(name = "last_wrong_at") val lastWrongAt: String?
)
