package com.beisong.app.repository

import com.beisong.app.data.dao.TextDao
import com.beisong.app.data.entity.TextEntity
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class ArticleRepository(private val textDao: TextDao) {
    fun observeArticles(): Flow<List<TextEntity>> = textDao.observeEnabledTexts()

    suspend fun getArticle(id: String): TextEntity? = textDao.getText(id)

    suspend fun saveArticle(
        id: String? = null,
        title: String,
        author: String?,
        dynasty: String?,
        fullText: String
    ): TextEntity {
        val now = Instant.now().toString()
        val existing = id?.let { textDao.getText(it) }
        val entity = TextEntity(
            id = existing?.id ?: id ?: UUID.randomUUID().toString(),
            title = title.trim(),
            author = author?.trim()?.ifBlank { null },
            dynasty = dynasty?.trim()?.ifBlank { null },
            type = existing?.type,
            difficulty = existing?.difficulty,
            lengthType = existing?.lengthType,
            fullText = fullText,
            enabled = existing?.enabled ?: 1,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now
        )
        textDao.upsertText(entity)
        return entity
    }
}
