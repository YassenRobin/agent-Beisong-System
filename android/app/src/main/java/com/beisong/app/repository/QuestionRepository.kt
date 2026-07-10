package com.beisong.app.repository

import com.beisong.app.data.dao.QuestionDao
import com.beisong.app.data.entity.QuestionEntity
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class QuestionRepository(private val questionDao: QuestionDao) {
    fun observeQuestions(): Flow<List<QuestionEntity>> = questionDao.observeEnabledQuestions()

    fun observeQuestionsByText(textId: String): Flow<List<QuestionEntity>> {
        return questionDao.observeEnabledQuestionsByText(textId)
    }

    suspend fun getQuestion(id: String): QuestionEntity? = questionDao.getQuestion(id)

    suspend fun getNextQuestion(): QuestionEntity? = questionDao.getNextEnabledQuestion()

    suspend fun saveManualQuestion(
        id: String? = null,
        textId: String,
        paragraphId: String?,
        type: String,
        star: Int,
        prompt: String,
        answer: String,
        hint: String?,
        explanation: String?
    ): QuestionEntity {
        val now = Instant.now().toString()
        val existing = id?.let { questionDao.getQuestion(it) }
        val entity = QuestionEntity(
            id = existing?.id ?: id ?: UUID.randomUUID().toString(),
            textId = textId,
            paragraphId = paragraphId,
            type = type,
            star = star.coerceIn(1, 5),
            difficulty = existing?.difficulty,
            prompt = prompt.trim(),
            optionsJson = existing?.optionsJson,
            answer = answer.trim(),
            sourceText = existing?.sourceText,
            logicRole = existing?.logicRole,
            hint = hint?.trim()?.ifBlank { null },
            explanation = explanation?.trim()?.ifBlank { null },
            createdBy = existing?.createdBy ?: "manual",
            enabled = existing?.enabled ?: 1,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now
        )
        questionDao.upsertQuestion(entity)
        return entity
    }
}
