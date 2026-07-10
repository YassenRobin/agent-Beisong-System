package com.beisong.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.beisong.app.repository.ArticleRepository
import com.beisong.app.repository.ProviderRepository
import com.beisong.app.repository.QuestionRepository
import com.beisong.app.repository.TrainingRepository
import com.beisong.app.ui.articles.ArticleListScreen
import com.beisong.app.ui.questions.QuestionListScreen
import com.beisong.app.ui.settings.ProviderSettingsScreen
import com.beisong.app.ui.training.TrainingScreen
import com.beisong.app.ui.wrong.WrongBookScreen

enum class AppRoute(val label: String) {
    Dashboard("首页"),
    Articles("文章"),
    Train("训练"),
    Wrong("错题"),
    Settings("设置")
}

@Composable
fun AppNavigation(
    articleRepository: ArticleRepository,
    questionRepository: QuestionRepository,
    trainingRepository: TrainingRepository,
    providerRepository: ProviderRepository
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: AppRoute.Dashboard.name

    Scaffold(
        bottomBar = {
            NavigationBar {
                AppRoute.entries.forEach { route ->
                    NavigationBarItem(
                        selected = currentRoute == route.name,
                        onClick = {
                            navController.navigate(route.name) {
                                launchSingleTop = true
                                popUpTo(AppRoute.Dashboard.name)
                            }
                        },
                        icon = { Text(route.label.take(1)) },
                        label = { Text(route.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = AppRoute.Dashboard.name,
            modifier = Modifier.padding(padding)
        ) {
            composable(AppRoute.Dashboard.name) {
                DashboardScreen(onOpenQuestions = { navController.navigate("Questions") })
            }
            composable(AppRoute.Articles.name) {
                ArticleListScreen(articleRepository)
            }
            composable(AppRoute.Train.name) {
                TrainingScreen(trainingRepository)
            }
            composable(AppRoute.Wrong.name) {
                WrongBookScreen(trainingRepository)
            }
            composable(AppRoute.Settings.name) {
                ProviderSettingsScreen(providerRepository)
            }
            composable("Questions") {
                QuestionListScreen(questionRepository)
            }
        }
    }
}

@Composable
private fun DashboardScreen(onOpenQuestions: () -> Unit) {
    ScreenColumn(title = "背诵") {
        Text("Android 原生版 Phase 1")
        Text("先完成离线文章、题目、训练和错题闭环。")
        Button(onClick = onOpenQuestions) {
            Text("打开题库")
        }
    }
}
