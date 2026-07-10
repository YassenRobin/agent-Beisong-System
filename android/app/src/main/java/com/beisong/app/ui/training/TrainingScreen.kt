package com.beisong.app.ui.training

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.beisong.app.data.entity.QuestionEntity
import com.beisong.app.repository.TrainingRepository
import com.beisong.app.ui.ScreenColumn
import kotlinx.coroutines.launch

@Composable
fun TrainingScreen(repository: TrainingRepository) {
    var question by remember { mutableStateOf<QuestionEntity?>(null) }
    var answer by remember { mutableStateOf("") }
    var feedback by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        question = repository.getNextQuestion()
    }

    ScreenColumn(title = "训练") {
        val current = question
        if (current == null) {
            Text("暂无可训练题目。")
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(current.prompt)
                OutlinedTextField(answer, { answer = it }, modifier = Modifier.fillMaxWidth(), label = { Text("你的答案") })
                Button(
                    onClick = {
                        scope.launch {
                            val result = repository.submitAnswer(current.id, answer)
                            feedback = result.judge.feedback
                            answer = ""
                        }
                    },
                    enabled = answer.isNotBlank()
                ) {
                    Text("提交")
                }
                if (feedback.isNotBlank()) {
                    Text(feedback)
                }
            }
        }
    }
}
