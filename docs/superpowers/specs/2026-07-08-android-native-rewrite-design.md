# Android Native Rewrite Design

## Goal

Rewrite Beisong as a real Android APK instead of wrapping the existing Electron app. The Android app should preserve the current product model: offline-first article, question, training, wrong-book, favorites, weak-point, Rogue, and AI-provider workflows, while replacing Electron IPC, Node services, and `better-sqlite3` with Android-native equivalents.

The migration rule is: keep the product behavior and data model recognizable, but do not carry desktop-only implementation details into Android.

## Current Context

The existing project is a Vite React renderer plus Electron main process. The renderer calls `src/api/ipc.ts`, which depends on `window.beisong` from `electron/preload.ts`. Business logic lives in `src-server/services/*`, and persistence is synchronous SQLite through `better-sqlite3` in `src-server/db/schema.ts`.

This means:

- React pages cannot become an APK by themselves because they depend on Electron IPC.
- `better-sqlite3`, `fs`, `path`, Electron `BrowserWindow`, and preload APIs do not run inside Android.
- The SQL schema and business behavior are valuable source material and should be ported.
- Existing tests and scripts are useful as behavioral references, especially local judge, article import, training recommendation, learning agent plan normalization, and Rogue damage.

## Target Stack

Use a native Android stack:

- Kotlin for application code.
- Jetpack Compose for UI.
- Room for SQLite persistence.
- Kotlin coroutines and Flow for async work and screen state.
- OkHttp plus Kotlin serialization for AI provider calls.
- Android Keystore for local API-key encryption.
- Gradle Android plugin for debug and release APK builds.

The Android code should live in a new `android/` directory so the current Electron app remains available during migration.

## Architecture

The Android app will use a layered architecture:

- `data`: Room database, entities, DAOs, migrations, encrypted API-key storage, and network clients.
- `domain`: pure models, validators, local judge, training recommendation, Rogue rules, AI plan normalization, and use cases.
- `ui`: Compose screens, navigation, view models, and UI state.
- `app`: dependency wiring, theme, top-level navigation, and application startup.

The boundary that replaces Electron IPC is a set of Kotlin use cases. A screen should not call DAOs or network clients directly; it calls a view model, the view model calls use cases, and use cases coordinate repositories.

## Data Model

Port the current SQLite schema into Room entities for these tables:

- `texts`
- `catalogs`
- `catalog_texts`
- `paragraphs`
- `sentences`
- `questions`
- `api_providers`
- `attempts`
- `wrong_items`
- `weak_points`
- `weak_point_questions`
- `weak_point_stats`
- `question_stats`
- `dungeons`
- `dungeon_questions`
- `question_favorites`
- `question_favorite_folders`
- `question_favorite_folder_items`
- `text_favorite_stats`
- `rogue_runs`
- `rogue_damage_logs`

For phase 1, implement only the tables needed for an offline training loop:

- `texts`
- `paragraphs`
- `sentences`
- `questions`
- `attempts`
- `wrong_items`
- `api_providers`

The full schema remains documented so later phases do not invent incompatible data.

## Feature Phases

### Phase 1: Offline Core APK

Build a native Android project that can install and run. It should support:

- Article list.
- Article create and edit.
- Naive paragraph/sentence split.
- Question list.
- Manual question create and edit.
- Training flow for existing questions.
- Local answer judging.
- Attempt recording.
- Wrong-item recording.
- API-provider list storage without making AI calls yet.

Acceptance criteria:

- `android/gradlew assembleDebug` produces a debug APK.
- App launches on an Android emulator or device.
- User can create an article, create a question, train on it, submit an answer, and see the attempt persisted after restart.

### Phase 2: AI Provider and Generation

Port provider configuration and AI generation:

- Provider CRUD.
- Active provider selection.
- Android Keystore encryption for API keys.
- OpenAI-compatible chat client.
- AI structure preview.
- AI question preview.
- Explicit import after preview.

The same product rule from the desktop app applies: AI proposes, app normalizes, user confirms before data is imported.

### Phase 3: Weak Points, Favorites, and Wrong Book

Port:

- Weak-point CRUD.
- Weak-point question generation preview/import.
- Wrong-book queue and status updates.
- Question favorites.
- Favorite folders.
- Ranking summaries.

### Phase 4: Rogue and Learning Agent

Port:

- Rogue dungeon generation and saving.
- Room/run play flow.
- Damage and heart rules.
- Learning Agent deterministic summary.
- AI plan normalization and safe execution.

Agent tool execution must keep the whitelist boundary. Android must not expose raw arbitrary action execution.

## UI Design Direction

The Android UI should be a usable app first, not a desktop UI squeezed into a phone. Use Compose Material 3 components with restrained styling:

- Bottom navigation for primary sections: Dashboard, Articles, Train, Wrong Book, Settings.
- Detail screens use top app bars with back navigation.
- Lists should be dense enough for repeated study work.
- Training screens prioritize prompt, answer input, submit action, and feedback.
- Avoid desktop-only sidebars on phone layouts.

Tablet support can use a navigation rail later, but phone layout is the phase-1 target.

## Android Data and Security

Store the Room database in Android app-private storage. Store encrypted API keys with Android Keystore-backed encryption.

Never write API keys to logs, plain JSON files, test fixtures, git-tracked files, or screenshots.

Export/import is out of phase-1 scope. When added later, exported data must avoid plain API keys.

## AI Networking

The Android app will implement OpenAI-compatible chat calls for Qwen, MiniMax, Kimi, and DeepSeek using provider metadata. Requests must use per-provider base URL, model, timeout, temperature, and max-token settings.

Network errors should produce inspectable user-facing messages. Parser hardening from the desktop app should be ported before enabling AI import flows.

## Testing Strategy

Use three layers of verification:

- JVM unit tests for pure domain logic: local judge, JSON parsing, training recommendation, Rogue damage, AI plan normalization.
- Room instrumentation tests for DAO behavior and migration safety.
- Compose UI smoke tests for phase-1 flows.

Desktop TypeScript tests remain useful as source-contract references during porting, but Android completion requires Kotlin tests and a real APK build.

## Out of Scope for First Pass

These are deliberately not part of phase 1:

- Publishing to an app store.
- Cloud sync or accounts.
- Importing the existing Windows user database automatically.
- Full desktop feature parity.
- Background AI jobs.
- Push notifications.

## Risks

- Full feature parity is large because current behavior spans many Electron IPC handlers and service modules.
- Some desktop UI patterns need redesign on phone rather than direct copying.
- AI output parsing and provider compatibility need careful porting to avoid silent bad imports.
- Room migrations must be planned before real user data accumulates.

## Implementation Order

1. Create the Android project and verify a debug APK can build.
2. Add Room schema for phase-1 tables.
3. Port pure domain models and local judge.
4. Build repositories and use cases for articles, questions, attempts, and wrong items.
5. Build Compose navigation and phase-1 screens.
6. Add provider storage without AI networking.
7. Verify the full offline training loop on an Android build.
8. Continue with phase-2 AI provider work after phase-1 is stable.
