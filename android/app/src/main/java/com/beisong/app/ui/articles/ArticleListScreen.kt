package com.beisong.app.ui.articles

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
import com.beisong.app.repository.ArticleRepository
import com.beisong.app.ui.ScreenColumn
import kotlinx.coroutines.launch

@Composable
fun ArticleListScreen(repository: ArticleRepository) {
    val articles by repository.observeArticles().collectAsState(initial = emptyList())
    var title by remember { mutableStateOf("") }
    var author by remember { mutableStateOf("") }
    var dynasty by remember { mutableStateOf("") }
    var fullText by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    ScreenColumn(title = "文章") {
        ArticleEditorScreen(
            title = title,
            author = author,
            dynasty = dynasty,
            fullText = fullText,
            onTitleChange = { title = it },
            onAuthorChange = { author = it },
            onDynastyChange = { dynasty = it },
            onFullTextChange = { fullText = it },
            onSave = {
                scope.launch {
                    repository.saveArticle(
                        title = title,
                        author = author,
                        dynasty = dynasty,
                        fullText = fullText
                    )
                    title = ""
                    author = ""
                    dynasty = ""
                    fullText = ""
                }
            }
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(articles) { article ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(article.title)
                        Text(listOfNotNull(article.dynasty, article.author).joinToString(" · "))
                    }
                }
            }
        }
    }
}

@Composable
fun ArticleEditorScreen(
    title: String,
    author: String,
    dynasty: String,
    fullText: String,
    onTitleChange: (String) -> Unit,
    onAuthorChange: (String) -> Unit,
    onDynastyChange: (String) -> Unit,
    onFullTextChange: (String) -> Unit,
    onSave: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, onTitleChange, modifier = Modifier.fillMaxWidth(), label = { Text("标题") })
        OutlinedTextField(author, onAuthorChange, modifier = Modifier.fillMaxWidth(), label = { Text("作者") })
        OutlinedTextField(dynasty, onDynastyChange, modifier = Modifier.fillMaxWidth(), label = { Text("朝代") })
        OutlinedTextField(fullText, onFullTextChange, modifier = Modifier.fillMaxWidth(), label = { Text("全文") })
        Button(onClick = onSave, enabled = title.isNotBlank() && fullText.isNotBlank()) {
            Text("保存文章")
        }
    }
}
