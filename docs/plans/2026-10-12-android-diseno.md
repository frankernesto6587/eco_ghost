# App Android de EcoGhost — Diseño y UX (S2)

> Estado: **ACEPTADA** (2026-10-12). Prototipo completo con visto bueno de Frank.
> - Direcciones visuales (4 pantallas): https://maquetas.merxbit.com/ecoghost-android/ (pública) · https://claude.ai/artifact/4uaAEp7ue7rz2DxdypTuc4 (privada)
> - **Prototipo navegable completo:** https://maquetas.merxbit.com/ecoghost-android-prototipo/ (pública). Fuente en `/home/frank/maquetas-public/ecoghost-android-prototipo/index.html`.
> Depende de `2026-10-12-android-arquitectura.md` (S1, aceptada).

## Principios
- **No replicar la web.** La web es de escritorio y de gestión; la app es para el día a día con el móvil en la mano.
- **Cómoda:** anotar un gasto en tres toques desde cualquier pantalla; lo importante abajo, al alcance del pulgar; gestos naturales (deslizar, tirar para refrescar).
- **Intuitiva:** pocas pantallas, poco texto, lenguaje de la calle ("Te deben", "Debes", "Falta"), nada de jerga contable.
- **Agradable:** Material 3 con identidad propia, modo claro y oscuro, animaciones suaves, estados vacíos cuidados.

## Usuarios y roles (según lo que permite la API, no la web)
Fuente: `apps/api/src/common/guards/roles.guard.ts`, `@Roles` en cada controller y `packages/shared/src/constants/index.ts`.

| Acción | OWNER | ADMIN | ACCOUNTANT | VIEWER |
|---|---|---|---|---|
| Ver todo (inicio, movimientos, deudas, análisis, cuentas, categorías, miembros) | ✓ | ✓ | ✓ | ✓ |
| Anotar movimiento, cambiar categoría/cuenta en lote | ✓ | ✓ | ✓ | – |
| **Editar o borrar un movimiento guardado, restaurar, borrar en lote** | ✓ | – | – | – |
| Crear/editar/borrar deudas y registrar pagos | ✓ | ✓ | ✓ | – |
| Categorías y etiquetas | ✓ | ✓ | ✓ | – |
| Presupuestos: crear/editar | ✓ | ✓ | ✓ | – |
| Presupuestos: borrar | ✓ | ✓ | – | – |
| Cuentas: crear/editar/borrar | ✓ | ✓ | – | – |
| Miembros: cambiar rol, expulsar | ✓ | ✓ | – | – |
| Organización: ajustes, token de invitación, Telegram, borrar | ✓ | – | – | – |

Cómo lo refleja la app:
- Lo que el rol no puede hacer **no aparece** (ni botón ni acción al deslizar). No se muestran botones que luego fallen con 403, como pasa hoy en la web con Editar/Eliminar para ADMIN y ACCOUNTANT.
- El rol se lee de `currentOrg.role` (lo devuelve `GET /organizations`) y cambia al cambiar de organización.
- Unirse a una organización: pegar el token de invitación (como en la web). Se entra siempre como VIEWER.
- Pendiente de decidir en S3: ¿se mantiene que solo el OWNER edite y borre movimientos?

## Arquitectura de información
- **Barra inferior:** Inicio · Movimientos · **[+]** · Deudas · Análisis.
- **Botón central [+]:** abre "Anotar" como hoja deslizante desde cualquier pestaña. Oculto para VIEWER.
- **Arriba a la izquierda (en Inicio):** chip con la organización activa; al tocarlo, cambiar de organización, crear una o unirse con token.
- **Avatar (arriba a la derecha):** "Más": cuentas, categorías, presupuestos, organización y miembros, ajustes (perfil, contraseña, Telegram, idioma, bloqueo biométrico), cerrar sesión.
- Cuentas y categorías no tienen pestaña propia: los saldos de cuentas se ven en Inicio y su gestión está en "Más".

## Pantallas de la v1
1. **Inicio:** saldo total por moneda (la `baseCurrency` de la org en grande, el resto en chips), fila de cuentas con saldo, el mes en dos barras (ingresos/gastos, sin categorías de ajuste), "Te deben"/"Debes", últimos movimientos. Datos de `dashboard/overview`.
2. **Anotar (hoja):** segmento Gasto · Ingreso · Transferencia; importe grande con teclado propio; descripción; cuenta en chips (preseleccionada: la última usada, si no, la `defaultAccountId` de la org, si no, la primera); categoría en chips con las más usadas (aprendidas del uso local) y "Todas" que abre el árbol; fecha "Hoy" y nota opcionales; "Guardar" y "Guardar y otro". Transferencia pide cuenta destino; si las monedas difieren, pasa a `EXCHANGE` y pide el importe destino.
3. **Movimientos:** búsqueda, filtros en chips (tipo, cuenta, mes), lista agrupada por día con total del día por moneda. Toque: detalle. OWNER: deslizar para borrar (con motivo, como la API) y editar desde el detalle.
4. **Deudas:** pestañas "Me deben" / "Debo", total pendiente, tarjeta por deuda con progreso, vencimiento (resaltado si está cerca) y "Registrar pago" (hoja: importe, cuenta, fecha). Liquidadas ocultas con enlace "Ver liquidadas (n)".
5. **Análisis:** se diseña en la siguiente iteración de S2 (con la skill de gráficas): selector de moneda y rango, donut por categoría, tendencia, presupuestos, recurrentes.
6. **Más y ajustes:** listas sencillas de Material 3; gestión de cuentas/categorías con formularios en hoja.
7. **Login y onboarding:** correo/contraseña y Google; al entrar sin organización, crear una o pegar token.

## Monedas e importes
- La API no convierte monedas: todo se agrupa **por moneda** (`Record<moneda, monto>`). La app nunca suma monedas distintas.
- Moneda principal = `baseCurrency` de la organización; el resto, en chips y en secciones secundarias.
- Importes: enteros en centavos (`Int`). Se muestran con separador de miles (espacio fino) y sin decimales cuando son cero; si hay centavos, se muestran (propuesta; la web siempre muestra 0 decimales).
- Código de moneda siempre visible junto al importe, en pequeño.
- Transferencias en gris y sin signo; `EXCHANGE` muestra ambos importes.

## Sin conexión (de S1)
- Aviso discreto arriba: "Sin conexión · datos de hace 2 h".
- Botones de crear/editar/pagar atenuados con explicación "Necesitas conexión para guardar". Nada se encola.

## Sistema visual
Tres direcciones en las maquetas, mismas pantallas:
- **A · Calma:** clara, sobria, verde bosque como único acento, Manrope, bordes finos sin sombras.
- **B · Cálido:** clara, fondos cálidos, frambuesa como acento, Nunito, muy redondeada, categorías de colores vivos.
- **C · Noche:** oscura siempre, oro viejo como acento, Outfit + DM Sans, superficies en capas.

Común a las tres: Material Symbols Rounded como iconos, un color e icono por categoría (ya existen `icon` y `color` en `Category`), números tabulares, chips para elegir, hojas deslizantes para crear.

**Decisión (2026-10-12): A en claro y C en oscuro, con una sola base.**
- Tipografía: Manrope (títulos y cifras en 800, cuerpo 500-600), números tabulares.
- Formas: **esquinas casi rectas** (decisión de Frank, 2026-10-12): radio 4 px en tarjetas, listas, chips, iconos de categoría y diálogos; 3 px en campos, botones, segmentos y etiquetas; 2 px en barras de progreso; 6 px en el botón + y el logo; 8 px en el borde superior de las hojas. Bordes finos de 1 px, sin sombras. Solo quedan redondos los avatares de personas y el interruptor.
- **Tema claro (Calma):** fondo `#F6F7F5`, superficie `#FFFFFF`, superficie 2 `#ECEFEC`, texto `#151A17`, atenuado `#68706A`, línea `#E0E4E1`, acento `#1F6B4A` (sobre acento `#FFFFFF`), acento suave `#E2EFE8`, ingreso `#1F6B4A`, aviso `#A86A14`, peligro `#B23A3A`.
- **Tema oscuro (Noche):** fondo `#0F1216`, superficie `#171B21`, superficie 2 `#1F252D`, texto `#ECEEF1`, atenuado `#8E96A2`, línea `#262D36`, acento `#D8B46A` (sobre acento `#17130A`), acento suave `#2A2618`, ingreso `#5CC89A`, aviso `#E3A14A`, peligro `#F07A7A`. El saldo grande de Inicio va en el acento.
- Colores de categoría: los de `Category.color` (por defecto los de `DEFAULT_CATEGORIES`), atenuados al 16 % como fondo del icono.
- **Selector:** Ajustes › Tema: Según el sistema (por defecto) / Claro / Oscuro. En Compose: `isSystemInDarkTheme()` salvo preferencia guardada en DataStore.
- Pendiente de fijar al programar: escala tipográfica completa, elevación de hojas y diálogos, estados vacíos y animaciones.

## Hallazgos del análisis que van a S3 (backend)
- **Seguridad:** `organizations/:id` (PATCH, DELETE, regenerate-token, disconnect-telegram) comprueba el rol contra `X-Organization-Id`, no contra `:id`; `GET /organizations/:id/members` no comprueba pertenencia; `telegram/set-webhook` y `webhook-info` no exigen rol.
- **Desajustes web/API:** Editar/Eliminar movimiento visibles para ADMIN y ACCOUNTANT; borrar presupuesto visible para ACCOUNTANT.
- `tenant.interceptor.ts` está muerto (no se registra). `ExchangeRate` y `PLAN_LIMITS` existen pero no se usan.
- La web no usa `Organization.defaultAccount`; solo el bot. La app sí lo usará.
- Para "categorías más usadas" no hace falta endpoint: se calcula en el móvil a partir de los movimientos recientes.

## Prototipo navegable (qué cubre)
Un solo teléfono con navegación real (pila de pantallas, hojas deslizantes, selectores, diálogos) y datos de ejemplo que cambian al guardar. Respeta los campos y permisos de la API:
- **Acceso:** entrar, crear cuenta (con Google), bienvenida con los 5 pasos del onboarding.
- **Pestañas:** Inicio, Movimientos (filtros, búsqueda local, agrupado por día), Deudas (Me deben/Debo, liquidadas), Análisis (moneda, periodo, donut por categoría, tendencia 6 meses, presupuestos, recurrentes, mayores gastos), Más.
- **Operaciones:** gasto, ingreso, transferencia (misma moneda), cambio (otra moneda, importe recibido y tasa), nueva deuda (crea el movimiento inicial), registrar pago (tope = pendiente), con "Guardar y otro".
- **Detalles:** movimiento (con historial y, para el propietario, editar sin cambiar el tipo y eliminar con motivo), deuda (progreso, pagos), cuenta (saldo y movimientos).
- **Gestión:** cuentas (tipo, moneda, icono; archivar), categorías (árbol de 2 niveles, icono, color, ajuste; eliminar con sus efectos), presupuestos (categoría o todos, tope, desde, repetir/hasta, notas; activo), etiquetas.
- **Organización:** datos, código de invitación (copiar, enviar, regenerar), miembros (cambiar rol a admin/contador/visualizador, expulsar), Telegram (conectar/desconectar), eliminar organización con confirmación; nueva organización; unirse con código; cambiar de organización.
- **Ajustes:** perfil, cambiar contraseña, bloqueo con huella, vincular Telegram (código de 6 dígitos), idioma, tema, avisos, versión y actualización.
- **Simulaciones:** rol (propietario/administrador/contador/visualizador) y sin conexión.

## Preguntas abiertas
- [x] Dirección visual: A en claro, C en oscuro, una sola base (2026-10-12).
- [ ] ¿Vale la barra inferior propuesta (Inicio · Movimientos · + · Deudas · Análisis) y "Más" en el avatar?
- [ ] ¿El flujo de "Anotar" en tres toques (importe → categoría → guardar) es como lo quieres?
- [ ] ¿Mostrar centavos cuando existan, o siempre sin decimales como la web?
- [ ] ¿Solo el OWNER edita y borra movimientos, o se abre a ADMIN?
