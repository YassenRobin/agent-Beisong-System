package com.beisong.app.repository

import com.beisong.app.data.dao.AttemptDao
import com.beisong.app.data.dao.QuestionDao
import com.beisong.app.data.dao.WrongItemDao
import com.beisong.app.data.entity.AttemptEntity
import com.beisong.app.data.entity.QuestionEntity
import com.beisong.app.data.entity.WrongItemEntity
import com.beisong.app.domain.JudgeResult
import com.beisong.app.domain.judgeLocally
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow

data class TrainingSubmitResult(
    val question: QuestionEntity,
    val judge: JudgeResult
)

class TrainingRepository(
    private val questionDao: QuestionDao,
    private val attemptDao: AttemptDao,
    private val wrongItemDao: WrongItemDao
) {
    suspend fun getNextQuestion(): QuestionEntity? = questionDao.getNextEnabledQuestion()

    fun observeWrongItems(): Flow<List<WrongItemEntity>> = wrongItemDao.observeActiveWrongItems()

    suspend fun submitAnswer(questionId: String, actual: String): TrainingSubmitResult {
        val question = questionDao.getQuestion(questionId)
            ?: throw IllegalArgumentException("Question not found: $questionId")
        val now = Instant.now().toString()
        val judge = judgeLocally(
            expected = question.answer,
            actual = actual,
            questionType = question.type,
            star = question.star
        )

        attemptDao.insertAttempt(
            AttemptEntity(
                id = UUID.randomUUID().toString(),
                userId = null,
                questionId = question.id,
                userAnswer = actual,
                isCorrect = if (judge.isCorrect) 1 else 0,
                score = judge.score,
                errorType = judge.errorType,
                feedback = judge.feedback,
                createdAt = now
            )
        )

        if (!judge.isCorrect) {
            val existing = wrongItemDao.getActiveWrongItem(question.id)
            wrongItemDao.upsertWrongItem(
                WrongItemEntity(
                    id = existing?.id ?: UUID.randomUUID().toString(),
                    userId = null,
                    textId = question.textId,
                    questionId = question.id,
                    expected = question.answer,
                    actual = actual,
                    errorType = judge.errorType,
                    count = (existing?.count ?: 0) + 1,
                    status = "active",
                    lastWrongAt = now
                )
            )
        }

        return TrainingSubmitResult(question = question, judge = judge)
    }
}
