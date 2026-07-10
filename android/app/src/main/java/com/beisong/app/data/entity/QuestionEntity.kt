package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "questions")
data class QuestionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "text_id") val textId: String,
    @ColumnInfo(name = "paragraph_id") val paragraphId: String?,
    val type: String,
    val star: Int = 1,
    val difficulty: Int?,
    val prompt: String,
    @ColumnInfo(name = "options_json") val optionsJson: String?,
    val answer: String,
    @ColumnInfo(name = "source_text") val sourceText: String?,
    @ColumnInfo(name = "logic_role") val logicRole: String?,
    val hint: String?,
    val explanation: String?,
    @ColumnInfo(name = "created_by") val createdBy: String?,
    val enabled: Int = 1,
    @ColumnInfo(name = "created_at") val createdAt: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: String?
)
