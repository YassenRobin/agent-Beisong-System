package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sentences")
data class SentenceEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "paragraph_id") val paragraphId: String,
    @ColumnInfo(name = "sentence_index") val sentenceIndex: Int?,
    val content: String,
    @ColumnInfo(name = "logic_role") val logicRole: String?,
    @ColumnInfo(name = "keywords_json") val keywordsJson: String?
)
