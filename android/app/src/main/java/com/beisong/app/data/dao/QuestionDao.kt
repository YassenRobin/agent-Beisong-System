package com.beisong.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beisong.app.data.entity.QuestionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface QuestionDao {
    @Query("SELECT * FROM questions WHERE enabled = 1 ORDER BY updated_at DESC")
    fun observeEnabledQuestions(): Flow<List<QuestionEntity>>

    @Query("SELECT * FROM questions WHERE text_id = :textId AND enabled = 1 ORDER BY updated_at DESC")
    fun observeEnabledQuestionsByText(textId: String): Flow<List<QuestionEntity>>

    @Query("SELECT * FROM questions WHERE id = :id LIMIT 1")
    suspend fun getQuestion(id: String): QuestionEntity?

    @Query("SELECT * FROM questions WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1")
    suspend fun getNextEnabledQuestion(): QuestionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertQuestion(question: QuestionEntity)
}
