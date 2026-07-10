package com.beisong.app.repository

import com.beisong.app.data.dao.ProviderDao
import com.beisong.app.data.entity.ApiProviderEntity
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class ProviderRepository(private val providerDao: ProviderDao) {
    fun observeProviders(): Flow<List<ApiProviderEntity>> = providerDao.observeProviders()

    suspend fun getActiveProvider(): ApiProviderEntity? = providerDao.getActiveProvider()

    suspend fun saveProvider(
        id: String? = null,
        name: String,
        providerType: String,
        baseUrl: String,
        defaultModel: String?
    ): ApiProviderEntity {
        val now = Instant.now().toString()
        val entity = ApiProviderEntity(
            id = id ?: UUID.randomUUID().toString(),
            name = name.trim(),
            providerType = providerType.trim(),
            baseUrl = baseUrl.trim(),
            apiKeyEncrypted = null,
            defaultModel = defaultModel?.trim()?.ifBlank { null },
            questionModel = defaultModel?.trim()?.ifBlank { null },
            judgeModel = defaultModel?.trim()?.ifBlank { null },
            explainModel = defaultModel?.trim()?.ifBlank { null },
            dungeonModel = defaultModel?.trim()?.ifBlank { null },
            weakPointModel = defaultModel?.trim()?.ifBlank { null },
            temperature = 0.3,
            maxTokens = 4096,
            timeoutSeconds = 60,
            enabled = 1,
            isActive = 0,
            createdAt = now,
            updatedAt = now
        )
        providerDao.upsertProvider(entity)
        return entity
    }
}
