package com.beisong.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beisong.app.data.entity.AttemptEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AttemptDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAttempt(attempt: AttemptEntity)

    @Query("SELECT * FROM attempts WHERE question_id = :questionId ORDER BY created_at DESC")
    fun observeAttempts(questionId: String): Flow<List<AttemptEntity>>
}
