package com.beisong.app.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.beisong.app.data.dao.AttemptDao
import com.beisong.app.data.dao.ProviderDao
import com.beisong.app.data.dao.QuestionDao
import com.beisong.app.data.dao.TextDao
import com.beisong.app.data.dao.WrongItemDao
import com.beisong.app.data.entity.ApiProviderEntity
import com.beisong.app.data.entity.AttemptEntity
import com.beisong.app.data.entity.ParagraphEntity
import com.beisong.app.data.entity.QuestionEntity
import com.beisong.app.data.entity.SentenceEntity
import com.beisong.app.data.entity.TextEntity
import com.beisong.app.data.entity.WrongItemEntity

@Database(
    entities = [
        TextEntity::class,
        ParagraphEntity::class,
        SentenceEntity::class,
        QuestionEntity::class,
        AttemptEntity::class,
        WrongItemEntity::class,
        ApiProviderEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class BeisongDatabase : RoomDatabase() {
    abstract fun textDao(): TextDao
    abstract fun questionDao(): QuestionDao
    abstract fun attemptDao(): AttemptDao
    abstract fun wrongItemDao(): WrongItemDao
    abstract fun providerDao(): ProviderDao
}
