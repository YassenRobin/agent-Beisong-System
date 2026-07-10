package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "paragraphs")
data class ParagraphEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "text_id") val textId: String,
    @ColumnInfo(name = "paragraph_index") val paragraphIndex: Int?,
    val content: String,
    val summary: String?,
    @ColumnInfo(name = "logic_role") val logicRole: String?
)
