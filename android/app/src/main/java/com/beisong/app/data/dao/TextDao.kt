package com.beisong.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beisong.app.data.entity.ParagraphEntity
import com.beisong.app.data.entity.SentenceEntity
import com.beisong.app.data.entity.TextEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TextDao {
    @Query("SELECT * FROM texts WHERE enabled = 1 ORDER BY updated_at DESC")
    fun observeEnabledTexts(): Flow<List<TextEntity>>

    @Query("SELECT * FROM texts WHERE id = :id LIMIT 1")
    suspend fun getText(id: String): TextEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertText(text: TextEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertParagraphs(paragraphs: List<ParagraphEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSentences(sentences: List<SentenceEntity>)

    @Query("SELECT * FROM paragraphs WHERE text_id = :textId ORDER BY paragraph_index ASC")
    fun observeParagraphs(textId: String): Flow<List<ParagraphEntity>>

    @Query("SELECT * FROM sentences WHERE paragraph_id = :paragraphId ORDER BY sentence_index ASC")
    suspend fun listSentences(paragraphId: String): List<SentenceEntity>
}
