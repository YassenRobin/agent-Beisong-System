package com.beisong.app.ui.questions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.beisong.app.repository.QuestionRepository
import com.beisong.app.ui.ScreenColumn
import kotlinx.coroutines.launch

@Composable
fun QuestionListScreen(repository: QuestionRepository) {
    val questions by repository.observeQuestions().collectAsState(initial = emptyList())
    var textId by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    ScreenColumn(title = "题库") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(textId, { textId = it }, modifier = Modifier.fillMaxWidth(), label = { Text("文章 ID") })
            OutlinedTextField(prompt, { prompt = it }, modifier = Modifier.fillMaxWidth(), label = { Text("题干") })
            OutlinedTextField(answer, { answer = it }, modifier = Modifier.fillMaxWidth(), label = { Text("答案") })
            Button(
                onClick = {
                    scope.launch {
                        repository.saveManualQuestion(
                            textId = textId,
                            paragraphId = null,
                            type = "blank",
                            star = 1,
                            prompt = prompt,
                            answer = answer,
                            hint = null,
                            explanation = null
                        )
                        prompt = ""
                        answer = ""
                    }
                },
                enabled = textId.isNotBlank() && prompt.isNotBlank() && answer.isNotBlank()
            ) {
                Text("保存题目")
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(questions) { question ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text(question.prompt)
                        Text("答案：${question.answer}")
                    }
                }
            }
        }
    }
}
