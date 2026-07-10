package com.beisong.app.ui.wrong

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.beisong.app.repository.TrainingRepository
import com.beisong.app.ui.ScreenColumn

@Composable
fun WrongBookScreen(repository: TrainingRepository) {
    val wrongItems by repository.observeWrongItems().collectAsState(initial = emptyList())

    ScreenColumn(title = "错题") {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(wrongItems) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text("标准答案：${item.expected.orEmpty()}")
                        Text("你的答案：${item.actual.orEmpty()}")
                        Text("次数：${item.count}")
                    }
                }
            }
        }
    }
}
