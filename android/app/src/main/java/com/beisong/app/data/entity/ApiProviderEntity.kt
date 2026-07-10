package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "api_providers")
data class ApiProviderEntity(
    @PrimaryKey val id: String,
    val name: String,
    @ColumnInfo(name = "provider_type") val providerType: String,
    @ColumnInfo(name = "base_url") val baseUrl: String,
    @ColumnInfo(name = "api_key_encrypted") val apiKeyEncrypted: String?,
    @ColumnInfo(name = "default_model") val defaultModel: String?,
    @ColumnInfo(name = "question_model") val questionModel: String?,
    @ColumnInfo(name = "judge_model") val judgeModel: String?,
    @ColumnInfo(name = "explain_model") val explainModel: String?,
    @ColumnInfo(name = "dungeon_model") val dungeonModel: String?,
    @ColumnInfo(name = "weak_point_model") val weakPointModel: String?,
    val temperature: Double = 0.3,
    @ColumnInfo(name = "max_tokens") val maxTokens: Int = 4096,
    @ColumnInfo(name = "timeout_seconds") val timeoutSeconds: Int = 60,
    val enabled: Int = 1,
    @ColumnInfo(name = "is_active") val isActive: Int = 0,
    @ColumnInfo(name = "created_at") val createdAt: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: String?
)
