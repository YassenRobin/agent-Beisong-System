package com.beisong.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beisong.app.data.entity.ApiProviderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProviderDao {
    @Query("SELECT * FROM api_providers ORDER BY updated_at DESC")
    fun observeProviders(): Flow<List<ApiProviderEntity>>

    @Query("SELECT * FROM api_providers WHERE is_active = 1 LIMIT 1")
    suspend fun getActiveProvider(): ApiProviderEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProvider(provider: ApiProviderEntity)
}
