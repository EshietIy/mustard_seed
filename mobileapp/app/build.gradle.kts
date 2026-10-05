plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
}

/** Sent as X-App-Version so the backend can ask old apps to update (AGENT.md section 15). */
val appVersionName = "0.1.0"

/**
 * API origin (the generated client's paths already start with api/v1/), never hard-coded in
 * source. Debug builds default to staging; override with -Pmsd.apiOrigin=... (for example
 * http://10.0.2.2:3000/ for a backend on this computer, seen from the emulator).
 * Release builds must be given one explicitly: production is not set up yet.
 */
val debugApiOrigin = providers.gradleProperty("msd.apiOrigin").orElse("https://msd-api.eshiet.i.ng/")
val releaseApiOrigin = providers.gradleProperty("msd.releaseApiOrigin")

val generatedApiDir = layout.buildDirectory.dir("generated/openapi")

@Suppress("UNCHECKED_CAST")
val specSchemaNames: List<String> =
    (
        (groovy.json.JsonSlurper().parse(rootProject.file("api/openapi.json")) as Map<String, Any>)[
            "components",
        ] as Map<String, Map<String, Any>>
    )["schemas"]!!.keys.toList()

android {
    namespace = "ng.mustardseed.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "ng.mustardseed.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = appVersionName
        buildConfigField("String", "APP_VERSION", "\"$appVersionName\"")
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_ORIGIN", "\"${debugApiOrigin.get()}\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField(
                "String",
                "API_ORIGIN",
                "\"${releaseApiOrigin.getOrElse("")}\"",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].kotlin.directories.add(
        generatedApiDir.map { it.dir("src/main/kotlin").asFile.path }.get(),
    )

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

// A release build without a real API URL must fail loudly, never ship pointing nowhere.
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    doFirst {
        check(releaseApiOrigin.isPresent && releaseApiOrigin.get().startsWith("https://")) {
            "Release builds need -Pmsd.releaseApiOrigin=https://… (the API origin)"
        }
    }
}

// The API client is generated from the backend's OpenAPI spec (AGENT.md section 15), never
// hand-written. Only the models and endpoints the app uses so far are generated.
openApiGenerate {
    generatorName.set("kotlin")
    library.set("jvm-retrofit2")
    inputSpec.set(rootProject.file("api/openapi.json").path)
    outputDir.set(generatedApiDir.get().asFile.path)
    packageName.set("ng.mustardseed.app.api")
    // The endpoints the app uses; every model they reference is generated.
    apiFilesConstrainedTo.set(listOf("Menu", "Config", "Site", "Auth", "Cart", "Orders", "Payments"))
    // Every model in the spec (it is fully typed; see the backend's openapi.feature). Listed
    // explicitly because constraining the APIs would otherwise skip models altogether.
    modelFilesConstrainedTo.set(specSchemaNames)
    // The serializer and its type adapters; the app builds its own Retrofit client (ApiFactory).
    supportingFilesConstrainedTo.set(
        listOf(
            "Serializer.kt",
            "ResponseExt.kt",
            "CollectionFormats.kt",
            "UUIDAdapter.kt",
            "URIAdapter.kt",
            "URLAdapter.kt",
            "BigDecimalAdapter.kt",
            "BigIntegerAdapter.kt",
            "LocalDateAdapter.kt",
            "LocalDateTimeAdapter.kt",
            "OffsetDateTimeAdapter.kt",
            "StringBuilderAdapter.kt",
            "AtomicBooleanAdapter.kt",
            "AtomicIntegerAdapter.kt",
            "AtomicLongAdapter.kt",
        ),
    )
    // Money is whole kobo: use Long so large totals can never overflow.
    typeMappings.set(mapOf("integer" to "kotlin.Long"))
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "useCoroutines" to "true",
            "enumPropertyNaming" to "UPPERCASE",
            "omitGradleWrapper" to "true",
            "omitGradlePluginVersions" to "true",
            "sourceFolder" to "src/main/kotlin",
        ),
    )
}

tasks.named("preBuild") { dependsOn("openApiGenerate") }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.retrofit.scalars)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.datastore.preferences)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
}
