package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "texts")
data class TextEntity(
    @PrimaryKey val id: String,
    val title: String,
    val author: String?,
    val dynasty: String?,
    val type: String?,
    val difficulty: String?,
    @ColumnInfo(name = "length_type") val lengthType: String?,
    @ColumnInfo(name = "full_text") val fullText: String,
    val enabled: Int = 1,
    @ColumnInfo(name = "created_at") val createdAt: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: String?
)
