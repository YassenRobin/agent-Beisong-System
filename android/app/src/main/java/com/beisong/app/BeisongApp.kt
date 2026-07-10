package com.beisong.app

import androidx.compose.runtime.Composable
import com.beisong.app.data.BeisongDatabase
import com.beisong.app.repository.ArticleRepository
import com.beisong.app.repository.ProviderRepository
import com.beisong.app.repository.QuestionRepository
import com.beisong.app.repository.TrainingRepository
import com.beisong.app.ui.AppNavigation

@Composable
fun BeisongApp(database: BeisongDatabase) {
    AppNavigation(
        articleRepository = ArticleRepository(database.textDao()),
        questionRepository = QuestionRepository(database.questionDao()),
        trainingRepository = TrainingRepository(
            questionDao = database.questionDao(),
            attemptDao = database.attemptDao(),
            wrongItemDao = database.wrongItemDao()
        ),
        providerRepository = ProviderRepository(database.providerDao())
    )
}
