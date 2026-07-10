package com.beisong.app.ui.settings

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
import com.beisong.app.repository.ProviderRepository
import com.beisong.app.ui.ScreenColumn
import kotlinx.coroutines.launch

@Composable
fun ProviderSettingsScreen(repository: ProviderRepository) {
    val providers by repository.observeProviders().collectAsState(initial = emptyList())
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("qwen") }
    var baseUrl by remember { mutableStateOf("") }
    var model by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    ScreenColumn(title = "设置") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(name, { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("名称") })
            OutlinedTextField(type, { type = it }, modifier = Modifier.fillMaxWidth(), label = { Text("类型") })
            OutlinedTextField(baseUrl, { baseUrl = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Base URL") })
            OutlinedTextField(model, { model = it }, modifier = Modifier.fillMaxWidth(), label = { Text("默认模型") })
            Button(
                onClick = {
                    scope.launch {
                        repository.saveProvider(
                            name = name,
                            providerType = type,
                            baseUrl = baseUrl,
                            defaultModel = model
                        )
                        name = ""
                        baseUrl = ""
                        model = ""
                    }
                },
                enabled = name.isNotBlank() && type.isNotBlank() && baseUrl.isNotBlank()
            ) {
                Text("保存 Provider")
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(providers) { provider ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text(provider.name)
                        Text(provider.providerType)
                        Text(provider.defaultModel.orEmpty())
                    }
                }
            }
        }
    }
}
