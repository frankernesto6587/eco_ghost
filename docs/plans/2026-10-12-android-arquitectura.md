# App Android de EcoGhost — Arquitectura (S1)

> Estado: **ACEPTADA** (2026-10-12).

## Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Stack | Nativo: Kotlin + Jetpack Compose (Material 3) |
| Alcance v1 | Transacciones (con alta rápida), cuentas y categorías, deudas, dashboard/análisis, organización y ajustes |
| Conexión | **Online.** La app guarda el último estado para poder **consultar** sin conexión; para crear o editar hace falta red |
| Diseño | **No copia la web.** App pensada para el móvil: muy cómoda, intuitiva y agradable. Tiene su propia sesión de diseño (S2) antes de escribir código de pantallas |
| Distribución | APK en `apk.merxbit.com/ecoghost/` con autoactualización (patrón de realtime-solar). Sin Play Store |
| Canal de prueba | Variante `prueba`, que se instala al lado de la real y apunta a un **entorno de pruebas** propio |

## Valores propuestos (a revisar)

### Proyecto
- **Ubicación:** `apps/android/` dentro del monorepo, como proyecto Gradle independiente. pnpm y Turborepo no lo tocan (se excluye de `pnpm-workspace.yaml`). Así el contrato con la API y la app viven en el mismo repo y los cambios se hacen en el mismo commit.
- **Paquete:** `com.merxbit.ecoghost`. La variante de prueba sería `com.merxbit.ecoghost.prueba`.
- **SDK:** `minSdk 26` (Android 8), `targetSdk/compileSdk 35`.
- **Toolchain:** mismas versiones que realtime-solar (AGP 8.7, Kotlin 2.0, Compose BOM 2024.12), con catálogo `gradle/libs.versions.toml`. Así reutilizamos el SDK y el JDK 17 que ya están en el VPS.

### Variantes de compilación
| Variante | Paquete | API | Manifiesto de actualización |
|---|---|---|---|
| `real` | `com.merxbit.ecoghost` | `https://apieco.merxbit.com/api/v1` | `apk.merxbit.com/ecoghost/latest.json` |
| `prueba` | `com.merxbit.ecoghost.prueba` | `https://apieco-prueba.merxbit.com/api/v1` | `apk.merxbit.com/ecoghost/prueba.json` |

Cada variante tiene su propio icono o banda de color, para no confundirlas en el móvil.

### Arquitectura de la app
- **Patrón:** MVVM con flujo unidireccional. Cada pantalla tiene un ViewModel que expone un `StateFlow<UiState>`, y la pantalla Compose solo pinta ese estado y envía eventos.
- **Capas:** `ui/` → `domain/` (casos de uso, solo donde aporten) → `data/`, con repositorios y fuentes de datos local y remota.
- **Inyección de dependencias:** Hilt.
- **Módulos Gradle:** un solo módulo `app` en la v1, organizado por paquetes según la funcionalidad (`feature/transactions`, `feature/debts`…). Se parte en módulos más adelante si el tiempo de compilación lo pide.
- **Navegación:** Navigation Compose con rutas tipadas (`@Serializable`). Barra inferior con Inicio, Movimientos, Deudas, Análisis y Más.

### Datos y red
- **HTTP:** Retrofit + OkHttp + kotlinx.serialization (igual que realtime-solar).
  - Un *interceptor* añade `Authorization` y `X-Organization-Id` a cada petición.
  - Un *Authenticator* refresca el token al recibir 401, con un mutex para que solo haya un refresh a la vez. Es el equivalente de la cola de `apps/web/src/services/api.ts`.
- **Contrato con la API:** se generan los DTOs desde el OpenAPI de Swagger (`/api/docs-json`) con openapi-generator (Kotlin, solo modelos). Los DTOs generados se mapean a las entidades de Room y del dominio, y nunca se usan directamente en la UI. Se generan con una tarea Gradle; el archivo JSON se guarda en el repo para que la compilación no dependa de tener la API levantada.
- **Caché local:** Room guarda la última respuesta de cada lista y pantalla (cuentas, categorías, movimientos recientes, deudas, resumen del dashboard). Es solo una caché, no la fuente de verdad.
- **Dinero:** `Long` en unidades mínimas. En la base de datos ya es `Int` (centavos); nunca se usa `Double`.
- **Fechas:** `java.time`.
- **Tokens:** el refresh token se guarda en DataStore, cifrado con una clave del Android Keystore. Las preferencias (organización activa, idioma) van en DataStore normal.

### Online con caché de lectura
- **Patrón:** *stale-while-revalidate*. La pantalla muestra al instante lo guardado en Room y, en paralelo, pide datos frescos a la API, actualiza la caché y la pantalla se refresca sola. Tirar hacia abajo para refrescar.
- **Sin conexión:**
  - se ve todo lo último guardado, con un aviso discreto del tipo "Sin conexión · datos de hace 2 h";
  - los botones de crear y editar se desactivan con una explicación, o dicen "necesitas conexión";
  - nada se encola: así no hay conflictos ni duplicados.
- **Al cambiar de organización o cerrar sesión:** se borra la caché de la organización anterior. La caché es por organización.
- **Ventaja:** el backend casi no necesita cambios para la app. Desaparecen los requisitos de sincronización (borrado lógico generalizado, endpoint de cambios, ids del cliente).
- **Ojo aparte:** `entrypoint.sh` hace `prisma db push --accept-data-loss`. Conviene pasar a `prisma migrate` igualmente antes de que la app dependa de la API.

### Login
- **Correo y contraseña:** contra `/auth/login`, igual que la web.
- **Google:** con Credential Manager de Android se obtiene un idToken de Google. Se manda a un endpoint nuevo `POST /auth/google/mobile` (S3), que lo verifica y devuelve los JWT de EcoGhost.
  - Hay que añadir clientes OAuth de tipo Android (uno por paquete con su SHA-1) en el proyecto de Google de Frank, desde la consola web, ya que no existe CLI para esto.
- **Bloqueo:** biométrico opcional al abrir la app (S8).

### Entorno de pruebas (S3)
- Segunda API más una base de datos Postgres separada en Dokploy, en `apieco-prueba.merxbit.com` y opcionalmente con web en `eco-prueba.merxbit.com`.
- Datos de prueba sembrados (sirve también para hacer capturas y probar el diseño con datos realistas). Bot de Telegram desactivado, o con otro bot, para no mandar avisos al grupo real.

### Publicación
- `apps/android/release.sh [real|prueba] "notas"`, copiado de `realtime-solar/android/release.sh`:
  - compila la variante;
  - copia el APK a `/home/frank/apk-public/ecoghost/`;
  - **escribe el json después del APK**.
- **Canal real:** `ecoghost-<ver>.apk`, `latest.apk` y `latest.json`.
- **Canal de prueba:** `ecoghost-prueba-<ver>.apk`, `ecoghost-prueba.apk` y `prueba.json`.
- `Updater.kt` copiado de realtime-solar: comprueba cada 6 h y además al abrir la app; cada variante lee su propio json.
- `index.html` sencillo en la carpeta, como el de contenedores: botón de descarga y enlace a la versión de prueba.
- **Firma:** keystore propio de EcoGhost, fuera del repo (`keystore.properties` está en `.gitignore`), con copia de seguridad. Si se pierde, no se puede actualizar la app instalada.

### Calidad
- **Tests unitarios** (JUnit + Turbine) de ViewModels y repositorios, incluido el comportamiento de la caché sin conexión.
- **Tests de Room** con Robolectric.
- **Tests de red** con MockWebServer (ya se usa en realtime-solar).
- **CI:** GitHub Actions compila y pasa los tests en cada PR; la publicación sigue siendo manual con `release.sh` (S9).

## Diseño (se detalla en S2)
Principios ya fijados:
- **No replicar la web.** Se parte de cómo se usa EcoGhost en el móvil, no de las pantallas de escritorio.
- **Cómoda:** lo frecuente a un toque (anotar un gasto en segundos desde cualquier sitio), acciones al alcance del pulgar (abajo) y gestos naturales (deslizar, tirar para refrescar).
- **Intuitiva:** pocas pantallas y poco texto, lenguaje de las finanzas del día a día y nada de jerga contable.
- **Agradable:** Material 3 con identidad propia de EcoGhost (color, tipografía, iconos de categoría), modo claro y oscuro, animaciones suaves y estados vacíos cuidados.

## Pendiente para cerrar S1
- [x] Frank aceptó la propuesta (2026-10-12).
