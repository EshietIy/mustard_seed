# Mustard Seed — Android app

Native Android app (Kotlin, Jetpack Compose) for ordering from Mustard Seed Restaurant & Bar.
Package name: `ng.mustardseed.app`. It talks to the backend **only through its REST API**
(`/api/v1`) and shares no code with `backend/` or `frontend/` (AGENT.md sections 2 and 15).

**Status:** first slice — browsing today's menu (read-only). Sign-in, cart, checkout,
payment and tracking come after the backend's app sign-in (bearer tokens) and server-side
cart slices.

## Toolchain

| Tool | Version |
|---|---|
| JDK | 21 (Temurin) |
| Gradle | 9.8.0 (wrapper, committed) |
| Android Gradle Plugin | 9.4.1 |
| Kotlin | 2.4.20 |
| compileSdk / targetSdk / minSdk | 37 / 36 / 26 |

`compileSdk` is 37 because current AndroidX and Coil require it; `targetSdk` stays 36 so the
app keeps Android 16's runtime behaviour until 37's changes are reviewed (lint warns about
this on purpose). Versions live in `gradle/libs.versions.toml`.

Without Android Studio, install JDK 21 and the Android command-line tools, then point
`local.properties` at the SDK (`sdk.dir=/path/to/Android/Sdk`; this file is not committed).

## Everyday commands

```bash
./gradlew :app:testDebugUnitTest   # unit + Compose UI tests (JVM, Robolectric; no emulator)
./gradlew spotlessApply            # format (ktlint)
./gradlew spotlessCheck :app:lintDebug :app:testDebugUnitTest :app:assembleDebug   # what CI runs
./gradlew :app:installDebug        # install on a connected phone or emulator
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Which backend the app talks to

The API origin is build configuration, never hard-coded in source:

- Debug builds default to staging: `https://msd-api.eshiet.i.ng/`.
- Use a backend on your computer from the emulator:
  `./gradlew :app:installDebug -Pmsd.apiOrigin=http://10.0.2.2:3000/`
  (plain http is allowed only for `10.0.2.2` and `localhost`, and only in debug builds).
- Release builds **fail** unless given `-Pmsd.releaseApiOrigin=https://…`, because
  production hosting is not set up yet.

Every request sends `X-App-Version`, so the backend can ask outdated apps to update
(HTTP 426, shown as "Please update the app to keep ordering.").

## API client

The client is **generated** from the backend's OpenAPI spec, `api/openapi.json`, at build
time (OpenAPI Generator, Retrofit + kotlinx.serialization). Never hand-write requests or copy
backend types. Only the endpoints and models the app uses are generated (see
`openApiGenerate` in `app/build.gradle.kts`); add to those lists as screens are built.

When the backend's API changes, refresh the contract from a running backend:

```bash
./scripts/update-openapi.sh                         # local backend on :3000
./scripts/update-openapi.sh https://msd-api.eshiet.i.ng
```

## Design

Colours come from the five design tokens in `ui/theme/Brand.kt` (crimson, gold, charcoal,
cream, white); muted text, borders and tints are derived from them with opacity, never new
hues. Fonts are bundled: Cormorant Garamond (headings) and Plus Jakarta Sans (UI), both under
the SIL Open Font License (`licenses/`).

## Errors

Every API call returns an `Outcome` (success or an `AppError`); no exception, raw message or
stack trace reaches the screen. Each error has a friendly message matching the website's
wording, a retry action, and a "Reference" line for server errors (AGENT.md section 7).
