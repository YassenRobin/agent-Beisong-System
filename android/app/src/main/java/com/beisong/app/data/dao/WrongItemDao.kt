package com.beisong.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beisong.app.data.entity.WrongItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WrongItemDao {
    @Query("SELECT * FROM wrong_items WHERE status = 'active' ORDER BY last_wrong_at DESC")
    fun observeActiveWrongItems(): Flow<List<WrongItemEntity>>

    @Query("SELECT * FROM wrong_items WHERE question_id = :questionId AND status = 'active' LIMIT 1")
    suspend fun getActiveWrongItem(questionId: String): WrongItemEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertWrongItem(item: WrongItemEntity)
}
