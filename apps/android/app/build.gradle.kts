import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.roborazzi)
}

// Firma de release: keystore.properties (fuera de git) con storeFile/storePassword/keyAlias/keyPassword.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.merxbit.ecoghost"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.merxbit.ecoghost"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "0.9.0"
        // Cliente web de Google (el mismo que usa la API): el ID token sale con esta audiencia.
        // Además, cada paquete necesita su cliente Android (paquete + SHA-1) en la consola.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"404310093136-87jpm95pd7q2s0al610ibgj9daai0f02.apps.googleusercontent.com\"")
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    // real = producción; prueba = se instala al lado y usa el entorno de pruebas
    flavorDimensions += "canal"
    productFlavors {
        create("real") {
            dimension = "canal"
            buildConfigField("String", "API_URL", "\"https://apieco.merxbit.com/api/v1/\"")
            buildConfigField("String", "UPDATE_URL", "\"https://apk.merxbit.com/ecoghost/latest.json\"")
            resValue("string", "app_name", "EcoGhost")
        }
        create("prueba") {
            dimension = "canal"
            applicationIdSuffix = ".prueba"
            versionNameSuffix = "-prueba"
            buildConfigField("String", "API_URL", "\"https://apieco-prueba.merxbit.com/api/v1/\"")
            buildConfigField("String", "UPDATE_URL", "\"https://apk.merxbit.com/ecoghost/prueba.json\"")
            resValue("string", "app_name", "EcoGhost Prueba")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
    // Robolectric: pinta las pantallas en la JVM (sin emulador) y Roborazzi guarda capturas
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.okhttp)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
