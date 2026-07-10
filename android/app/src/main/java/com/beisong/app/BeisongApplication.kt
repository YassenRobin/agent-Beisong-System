package com.beisong.app

import android.app.Application
import androidx.room.Room
import com.beisong.app.data.BeisongDatabase

class BeisongApplication : Application() {
    val database: BeisongDatabase by lazy {
        Room.databaseBuilder(
            applicationContext,
            BeisongDatabase::class.java,
            "beisong.db"
        ).build()
    }
}
