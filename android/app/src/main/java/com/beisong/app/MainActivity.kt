package com.beisong.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.beisong.app.ui.BeisongTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as BeisongApplication
        setContent {
            BeisongTheme {
                BeisongApp(database = app.database)
            }
        }
    }
}
