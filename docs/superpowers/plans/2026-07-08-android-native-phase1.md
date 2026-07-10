# Android Native Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a native Android debug APK with the offline article, question, training, attempt, wrong-book, and provider-storage core described in `docs/superpowers/specs/2026-07-08-android-native-rewrite-design.md`.

**Architecture:** Add a new `android/` Gradle project beside the existing Electron app. Implement Kotlin layers for Room persistence, pure domain logic, repositories/use cases, and Compose UI, keeping the current desktop project untouched during phase 1.

**Tech Stack:** Kotlin, Gradle Android plugin, Jetpack Compose Material 3, Room, Kotlin serialization, coroutines, AndroidX Navigation Compose, JUnit.

---

## File Structure

- Create `android/settings.gradle.kts`
  - Defines the Android Gradle project.
- Create `android/build.gradle.kts`
  - Holds top-level Gradle plugin versions.
- Create `android/gradle.properties`
  - Enables AndroidX and Kotlin settings.
- Create `android/app/build.gradle.kts`
  - Defines app package, SDK versions, Compose, Room, and test dependencies.
- Create `android/app/src/main/AndroidManifest.xml`
  - Declares the Android application and `MainActivity`.
- Create `android/app/src/main/res/values/styles.xml`
  - Provides the launch theme referenced by the manifest.
- Create `android/app/src/main/java/com/beisong/app/BeisongApplication.kt`
  - Provides the application class used by the manifest.
- Create `android/app/src/main/java/com/beisong/app/MainActivity.kt`
  - Hosts Compose content.
- Create `android/app/src/main/java/com/beisong/app/BeisongApp.kt`
  - Wires database, repositories, and navigation.
- Create `android/app/src/main/java/com/beisong/app/data/BeisongDatabase.kt`
  - Room database and entity registration for phase-1 tables.
- Create `android/app/src/main/java/com/beisong/app/data/entity/*.kt`
  - Room entities for texts, paragraphs, sentences, questions, attempts, wrong items, and providers.
- Create `android/app/src/main/java/com/beisong/app/data/dao/*.kt`
  - DAOs for phase-1 persistence.
- Create `android/app/src/main/java/com/beisong/app/domain/*.kt`
  - Pure models and local judge.
- Create `android/app/src/main/java/com/beisong/app/repository/*.kt`
  - Repository APIs for screens and use cases.
- Create `android/app/src/main/java/com/beisong/app/ui/*.kt`
  - Compose navigation, theme, screens, and view models.
- Create `android/app/src/test/java/com/beisong/app/domain/LocalJudgeTest.kt`
  - JVM tests for local judging behavior.
- Create `android/setup-android-env.ps1`
  - Downloads local Android command-line tools and Gradle, installs SDK packages, creates the Gradle wrapper, and builds the debug APK.

---

## Environment Gate

The phase-1 source can be created without Android tooling, but APK verification requires:

- JDK 17.
- Gradle available on `PATH` long enough to generate the wrapper, or an existing `gradlew.bat`.
- Android SDK with platform 35 and build tools installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing to the SDK.

Current machine check on 2026-07-08 found JDK 17 available, but `gradle`, `sdkmanager`, and Android SDK environment variables were not available. Until those are installed, implementation can continue at the source level, but `assembleDebug` cannot produce an APK on this machine.

Run this local setup command when network access is allowed:

```powershell
powershell -ExecutionPolicy Bypass -File .\android\setup-android-env.ps1
```

Expected: the script creates `android/.android-sdk`, creates `android/gradlew.bat`, installs platform 35/build-tools 35, and runs `android/gradlew.bat assembleDebug`.

---

### Task 1: Android Project Skeleton

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle.properties`
- Create: `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/styles.xml`
- Create: `android/app/src/main/java/com/beisong/app/BeisongApplication.kt`
- Create: `android/app/src/main/java/com/beisong/app/MainActivity.kt`

- [ ] **Step 1: Create Gradle settings**

Create `android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "BeisongAndroid"
include(":app")
```

- [ ] **Step 2: Create top-level Gradle build**

Create `android/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("com.google.devtools.ksp") version "2.0.21-1.0.28" apply false
}
```

- [ ] **Step 3: Create Gradle properties**

Create `android/gradle.properties`:

```properties
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
```

- [ ] **Step 4: Create app Gradle build**

Create `android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.beisong.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.beisong.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    val roomVersion = "2.6.1"
    val navVersion = "2.8.5"

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3:1.3.1")
    implementation("androidx.navigation:navigation-compose:$navVersion")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation("junit:junit:4.13.2")
}
```

- [ ] **Step 5: Create manifest and launch activity**

Create `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:name=".BeisongApplication"
        android:allowBackup="true"
        android:label="背诵"
        android:supportsRtl="true"
        android:theme="@style/Theme.Beisong">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

Create `android/app/src/main/res/values/styles.xml`:

```xml
<resources>
    <style name="Theme.Beisong" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:navigationBarColor">#FFFFFF</item>
        <item name="android:windowActionModeOverlay">true</item>
    </style>
</resources>
```

Create `android/app/src/main/java/com/beisong/app/BeisongApplication.kt`:

```kotlin
package com.beisong.app

import android.app.Application

class BeisongApplication : Application()
```

Create `android/app/src/main/java/com/beisong/app/MainActivity.kt`:

```kotlin
package com.beisong.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface {
                    Text("Beisong Android")
                }
            }
        }
    }
}
```

- [ ] **Step 6: Build the skeleton**

Run:

```powershell
Set-Location android
gradle wrapper
.\gradlew.bat assembleDebug
```

Expected: `android/app/build/outputs/apk/debug/app-debug.apk` exists.

---

### Task 2: Phase-1 Room Schema

**Files:**
- Modify: `android/app/src/main/java/com/beisong/app/BeisongApplication.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/BeisongDatabase.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/TextEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/ParagraphEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/SentenceEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/QuestionEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/AttemptEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/WrongItemEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/entity/ApiProviderEntity.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/dao/TextDao.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/dao/QuestionDao.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/dao/AttemptDao.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/dao/WrongItemDao.kt`
- Create: `android/app/src/main/java/com/beisong/app/data/dao/ProviderDao.kt`

- [ ] **Step 1: Replace the starter application with a database holder**

Update `BeisongApplication.kt` with a lazily initialized Room database:

```kotlin
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
```

- [ ] **Step 2: Add entities**

Create Room entities with column names matching the desktop SQL schema. Use `String` IDs, nullable optional columns, `Int` for SQLite booleans, and `String` JSON columns.

Example `TextEntity.kt`:

```kotlin
package com.beisong.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "texts")
data class TextEntity(
    @PrimaryKey val id: String,
    val title: String,
    val author: String?,
    val dynasty: String?,
    val type: String?,
    val difficulty: String?,
    @ColumnInfo(name = "length_type") val lengthType: String?,
    @ColumnInfo(name = "full_text") val fullText: String,
    val enabled: Int = 1,
    @ColumnInfo(name = "created_at") val createdAt: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: String?
)
```

- [ ] **Step 3: Add DAOs**

Create DAO interfaces with focused phase-1 operations:

```kotlin
@Dao
interface TextDao {
    @Query("SELECT * FROM texts WHERE enabled = 1 ORDER BY updated_at DESC")
    fun observeEnabledTexts(): Flow<List<TextEntity>>

    @Query("SELECT * FROM texts WHERE id = :id LIMIT 1")
    suspend fun getText(id: String): TextEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertText(text: TextEntity)
}
```

Use the same pattern for questions, attempts, wrong items, and providers.

- [ ] **Step 4: Register database**

Create `BeisongDatabase.kt`:

```kotlin
package com.beisong.app.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.beisong.app.data.dao.AttemptDao
import com.beisong.app.data.dao.ProviderDao
import com.beisong.app.data.dao.QuestionDao
import com.beisong.app.data.dao.TextDao
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
```

- [ ] **Step 5: Build schema**

Run:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Expected: Room code generation succeeds and the APK still builds.

---

### Task 3: Local Judge Domain Port

**Files:**
- Create: `android/app/src/main/java/com/beisong/app/domain/QuestionType.kt`
- Create: `android/app/src/main/java/com/beisong/app/domain/JudgeResult.kt`
- Create: `android/app/src/main/java/com/beisong/app/domain/LocalJudge.kt`
- Create: `android/app/src/test/java/com/beisong/app/domain/LocalJudgeTest.kt`

- [ ] **Step 1: Write judge tests**

Create `LocalJudgeTest.kt`:

```kotlin
package com.beisong.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalJudgeTest {
    @Test
    fun exactAnswerIsCorrect() {
        val result = judgeLocally(expected = "海内存知己", actual = "海内存知己", questionType = "blank", star = 2)
        assertTrue(result.isCorrect)
        assertEquals(1.0, result.score, 0.0001)
    }

    @Test
    fun normalizedWhitespaceIsCorrect() {
        val result = judgeLocally(expected = "天涯若比邻", actual = " 天涯 若 比邻 ", questionType = "blank", star = 2)
        assertTrue(result.isCorrect)
    }

    @Test
    fun differentAnswerIsWrong() {
        val result = judgeLocally(expected = "无边落木萧萧下", actual = "不尽长江滚滚来", questionType = "blank", star = 3)
        assertEquals(false, result.isCorrect)
        assertEquals("content_mismatch", result.errorType)
    }
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
Set-Location android
.\gradlew.bat testDebugUnitTest --tests com.beisong.app.domain.LocalJudgeTest
```

Expected: fails because the domain files do not exist yet.

- [ ] **Step 3: Implement local judge**

Create:

```kotlin
package com.beisong.app.domain

data class JudgeResult(
    val isCorrect: Boolean,
    val score: Double,
    val errorType: String?,
    val feedback: String
)

fun judgeLocally(expected: String, actual: String, questionType: String?, star: Int?): JudgeResult {
    val expectedNorm = normalizeAnswer(expected)
    val actualNorm = normalizeAnswer(actual)
    val correct = expectedNorm == actualNorm
    return if (correct) {
        JudgeResult(true, 1.0, null, "回答正确")
    } else {
        JudgeResult(false, 0.0, "content_mismatch", "答案与标准答案不一致")
    }
}

private fun normalizeAnswer(value: String): String {
    return value.replace(Regex("\\s+"), "")
        .replace("，", ",")
        .replace("。", ".")
        .trim()
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run:

```powershell
Set-Location android
.\gradlew.bat testDebugUnitTest --tests com.beisong.app.domain.LocalJudgeTest
```

Expected: all local judge tests pass.

---

### Task 4: Offline Training Repositories

**Files:**
- Create: `android/app/src/main/java/com/beisong/app/repository/ArticleRepository.kt`
- Create: `android/app/src/main/java/com/beisong/app/repository/QuestionRepository.kt`
- Create: `android/app/src/main/java/com/beisong/app/repository/TrainingRepository.kt`
- Create: `android/app/src/main/java/com/beisong/app/repository/ProviderRepository.kt`

- [ ] **Step 1: Add repository APIs**

Create repository classes that wrap DAOs and expose suspend/Flow APIs:

```kotlin
class ArticleRepository(private val textDao: TextDao) {
    fun observeArticles(): Flow<List<TextEntity>> = textDao.observeEnabledTexts()
    suspend fun getArticle(id: String): TextEntity? = textDao.getText(id)
    suspend fun saveArticle(text: TextEntity) = textDao.upsertText(text)
}
```

Question repository should expose enabled questions by text ID and save manual questions. Training repository should:

- Load the next enabled question.
- Call `judgeLocally`.
- Insert an attempt.
- Insert or update a wrong item when the answer is wrong.

- [ ] **Step 2: Build repositories**

Run:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Expected: repositories compile with the Room DAOs.

---

### Task 5: Compose Navigation and Phase-1 Screens

**Files:**
- Create: `android/app/src/main/java/com/beisong/app/BeisongApp.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/BeisongTheme.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/AppNavigation.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/articles/ArticleListScreen.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/articles/ArticleEditorScreen.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/questions/QuestionListScreen.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/training/TrainingScreen.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/wrong/WrongBookScreen.kt`
- Create: `android/app/src/main/java/com/beisong/app/ui/settings/ProviderSettingsScreen.kt`
- Modify: `android/app/src/main/java/com/beisong/app/MainActivity.kt`

- [ ] **Step 1: Replace the starter activity**

Update `MainActivity.kt` so it renders `BeisongApp`:

```kotlin
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
```

- [ ] **Step 2: Add app shell**

Create a bottom navigation shell with five routes:

```kotlin
enum class AppRoute(val label: String) {
    Dashboard("首页"),
    Articles("文章"),
    Train("训练"),
    Wrong("错题"),
    Settings("设置")
}
```

Each route must render a real screen, even if the first pass uses minimal controls.

- [ ] **Step 3: Implement phase-1 screens**

Implement screens with these minimum behaviors:

- Article list shows persisted articles and an add action.
- Article editor saves title, author, dynasty, and full text.
- Question list shows persisted questions and an add action.
- Training screen selects one question, accepts an answer, records attempt, and shows feedback.
- Wrong book screen lists wrong items.
- Settings screen stores provider metadata without making network calls.

- [ ] **Step 4: Build UI**

Run:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Expected: APK builds and Compose screens compile.

---

### Task 6: Phase-1 Verification

**Files:**
- All files under `android/`

- [ ] **Step 1: Run unit tests**

Run:

```powershell
Set-Location android
.\gradlew.bat testDebugUnitTest
```

Expected: local judge and repository unit tests pass.

- [ ] **Step 2: Build debug APK**

Run:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Expected: `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Inspect tracked diff**

Run:

```powershell
git -c safe.directory=D:/gitClone/Beisong status --short
git -c safe.directory=D:/gitClone/Beisong diff --stat -- android docs/superpowers/specs/2026-07-08-android-native-rewrite-design.md docs/superpowers/plans/2026-07-08-android-native-phase1.md
```

Expected: phase-1 work is isolated to `android/` and the two Android migration docs.

---

## Self-Review

- Spec coverage: phase 1 covers APK skeleton, Room storage, article/question/training/wrong-item/provider storage, local judge, and build verification.
- Scope control: AI networking, Rogue, favorites, weak points, and Learning Agent are documented in the design but deliberately left for later phase plans.
- Red-flag scan: the plan has no open-ended markers; each task names concrete files, commands, and expected evidence.
- Type consistency: package name, database name, table names, and Gradle module paths are consistent across tasks.
