# Funcionalidades — Agenda Semanal I.E. Jesús Rey
**Última revisión del código:** 2026-11-23

Documento vivo: cada vez que se agregue o cambie algo en la app, se actualiza aquí.
(El estado técnico y de despliegue está en [ESTADO_PROYECTO.md](ESTADO_PROYECTO.md)).

---

## 1. Ingreso (Login) — `src/pages/Login.jsx`

Pantalla "Agenda Semanal — Institución Educativa Jesús Rey" con la marca "By Poncho 2026".

| Paso | Cuándo aparece | Qué hace |
|---|---|---|
| **1. Elegir usuario** | Siempre | Lista desplegable con los usuarios, ordenados por nombre. No se escribe el usuario. |
| **2. Clave temporal** | Usuario nuevo o con la clave reiniciada | Pide la clave que dio el admin (por defecto `agenda2026`). Si no coincide: *"Contraseña temporal incorrecta"*. |
| **3. Crear contraseña** | Después del paso 2 | Nueva contraseña + confirmar. Deben coincidir y tener **mínimo 4 caracteres**. Se guarda **cifrada (bcrypt)**. Entra directo. |
| **4. Contraseña personal** | Usuario que ya creó la suya | Pide la contraseña y entra. Si no coincide: *"Contraseña incorrecta"*. |

- En los pasos 2, 3 y 4 hay un botón **Volver**.
- **Sesión**: token aleatorio guardado en el navegador. Las sesiones viven en la memoria del servidor: **al hacer Restart en cPanel todos deben volver a ingresar**.
- **Salir** cierra la sesión en el servidor y en el navegador.

---

## 2. Barra superior — `src/components/BarraSuperior.jsx`

La misma barra en la pantalla de actividades y en el panel del admin. **Queda fija arriba** aunque se baje en la página. Lleva "By Poncho 2026" sobre el nombre del usuario.

| Zona | Docente | Admin |
|---|---|---|
| Izquierda | Nombre · 👥 conectados | Nombre · **ADMIN** · 👥 conectados |
| Centro | — | Menú **Actividades · Historial · Usuarios** (la sección actual resaltada) |
| Derecha | **Salir** | **🔒 Cerrar y descargar PDF** (solo en Actividades con la agenda abierta) · **Salir** |

- **👥 N conectados ▼**: quiénes están viendo la agenda ahora (se actualiza cada 10 s; alguien deja de contar 20 s después de salir). Al pulsarlo se despliega la lista de nombres (el propio aparece como "(yo)").
- **Cierre por inactividad (30 min)**: si el usuario no hace nada en la página (mouse, teclado, desplazamiento) durante 28 min, sale el aviso **"⏰ ¿Sigues ahí?"** con cuenta regresiva y botón **Seguir aquí**. A los 30 min se cierra la sesión (también en el servidor), sale un mensaje y vuelve al login. La actualización automática cada 10 s no cuenta como actividad. Se mide en cada PC/pestaña por separado.

---

## 3. Actividades (agenda semanal) — `src/pages/Agenda.jsx`

### Encabezado
- Imagen de portada (circular), **Agenda #N**, rango de fechas (ej. "Lunes 30 de noviembre — Viernes 4 de diciembre") y texto introductorio.

### Pestañas por día
- Una pestaña por cada día entre la fecha de inicio y la final (normalmente lunes a viernes).

### Tabla de actividades
Columnas: **Jornada ☐ · Entrada · Salida · PROPÓSITO PEDAGÓGICO - ADMINISTRATIVO · ESPACIO - LUGAR · LIDER DEL ENCUENTRO · OBSERVACIONES · Creador · ✕** (mismos títulos de la agenda en papel)

- **+ Agregar actividad** crea una fila nueva.
- **Horas**: con un **reloj visual** (hora, luego minutos de 5 en 5, AM/PM).
  - La **salida debe ser después de la entrada**. Si no, las horas se ponen en rojo con *"La salida debe ser después de la entrada"* y la fila **no se guarda** (el servidor también lo valida).
- **☐ Durante la jornada**: casilla en la columna **Jornada**, a la izquierda de la hora de entrada, **siempre desmarcada** salvo que el usuario la marque. Al marcarla, Entrada y Salida se reemplazan por **DURANTE LA JORNADA** (sin reloj); al desmarcarla vuelven las horas vacías. Se guarda en el mismo campo de la hora (la BD no cambia). Estas actividades **van de primeras** en el día y **no bloquean espacios** (suelen usar varios lugares; se escriben en ESPACIO - LUGAR, ej. "Aulas, Patio Central"). En el PDF salen como "DURANTE LA JORNADA" ocupando las dos columnas de hora.
- **Espacio**: **texto libre** con sugerencias de la tabla `espacios`. Si lo escrito coincide con un espacio de la lista (sin importar mayúsculas, tildes o espacios de más, ej. "auditorio"), se guarda con el nombre exacto ("Auditorio") para que el control de cruces funcione.
- **Líder**: **texto libre** con sugerencias de la tabla `lideres`.
- **Creador**: "Yo" en las propias, o el nombre de quien la creó.
- **Permisos**: cada usuario solo edita y elimina **sus propias** actividades; las de otros se ven en gris.
- **Guardado automático**: cada campo se guarda al salir de él ("✓ Guardado"). La fila se guarda en la base de datos cuando tiene al menos **hora de entrada o propósito**, y cada guardado envía la fila completa.
- **Actualización automática**: cada 10 s aparece lo que agregaron, cambiaron o borraron los demás, **sin recargar**. Se pausa mientras el usuario escribe en un campo, tiene el reloj abierto o se está guardando, para no borrar lo que teclea.

### Conflictos de espacio
Aplica a **Auditorio, Biblioteca, PTA, Patio Central y Rectoría**.
- Si dos actividades del mismo día usan el mismo espacio con horas que se cruzan: el Espacio se pone rojo (*"Conflicto: mismo lugar y hora"*), sale un banner rojo arriba y **no se guarda**.
- El servidor también lo valida: si dos personas lo eligen casi a la vez, **gana el primero que guarda**.

### 🔒 Cerrar y descargar PDF (solo admin)
1. Pide confirmación.
2. Cierra la agenda y **descarga el PDF**.
3. Ahí mismo sale el mensaje: *"Agenda #N cerrada. El PDF se descargó. Iniciarás la Agenda #N+1 del lunes … al viernes …"*.
4. Al pulsar **Aceptar** se abre el **formulario de la nueva agenda** ya relleno (número, fechas, y el texto y la imagen de la anterior). Ahí se puede cambiar el texto, la imagen o lo que haga falta.
5. **Crear agenda** → pasa a Actividades, lista para registrar.

- La nueva agenda va de lunes a viernes de la **semana siguiente**. Si esa semana ya pasó (se cerró tarde), empieza en la **semana actual**.
- El número es **el mayor que exista + 1**.

### Sin agenda abierta
- Mensaje *"No hay agenda activa"*. El admin ve el botón **Soy un administrador**, que lleva al formulario para **crear la primera agenda**.

### Modo consulta (`/agenda?id=N`)
- Se abre desde **Historial → 👁 Ver**: cualquier agenda, **solo lectura**, con la columna **Creador**.
- Banner azul *"👁 Consultando la Agenda #N — solo lectura"* con **← Volver al historial**.
- El botón de la barra es **📄 PDF** (solo descarga).
- Quien consulta no cuenta como conectado.

### Agenda cerrada
- Banner *"🔒 Esta agenda está cerrada"*. Todo en solo lectura (también bloqueado en el servidor).

---

## 4. Panel del admin — `src/pages/Admin.jsx`

Solo entra un usuario con `es_admin = 1`; los demás van al login.

### 4.1 Formulario de nueva agenda
Aparece al **aceptar el mensaje después de cerrar** una agenda (sección 3), o con **Soy un administrador** cuando no hay ninguna agenda abierta (por ejemplo, la primera vez). Viene relleno con el número siguiente, las fechas de la semana siguiente, y el texto y la imagen de la agenda anterior.
- Tarjeta informativa de la agenda activa (número, fechas, estado), si existe.
- **Formulario**:
  - **Número** — propuesto automáticamente (mayor + 1), editable.
  - **Fecha inicio** — al elegirla, la **fecha fin se pone sola en el viernes** de esa semana.
    - Si no es lunes: aviso amarillo *"La agenda está empezando un martes… ¿Está seguro?"* y confirmación al guardar (solo advertencia).
    - **No se puede elegir una semana pasada** (desde el lunes de la semana actual en adelante).
  - **Fecha fin** — editable, pero **no puede ser anterior** al inicio.
  - **Texto introductorio** e **imagen de portada** (la imagen se guarda dentro de la base de datos).
- Al pulsar **Crear agenda**, si sale bien, pasa directo a **Actividades**.
- **Validaciones del servidor**: número no repetido, fechas no cruzadas con otra agenda, fin no anterior al inicio y no crear agendas en semanas pasadas.

### 4.2 Historial
- Tabla de todas las agendas: **# · Inicio · Fin · Creada por · Estado · Acciones** (la más reciente primero).
- **👁 Ver**: modo consulta (solo lectura, con Creador).
- **📄 PDF**: descarga el PDF de esa agenda.

### 4.3 Usuarios
- **Agregar usuario**: nombre, apellidos y clave temporal (por defecto `agenda2026`). Entra como docente.
- Lista de usuarios con:
  - **Reiniciar clave**: borra la contraseña personal y genera una **clave temporal aleatoria de 6 caracteres** que se muestra en pantalla. El usuario repite los pasos 2 y 3 del login.
  - **Eliminar**: pide confirmación y **borra definitivamente** al usuario. Sus agendas y actividades se conservan. El admin no puede eliminarse a sí mismo.

---

## 5. PDF de la agenda — `src/utils/pdfAgenda.js`

Mismo diseño que la versión PHP. Se genera en el navegador (jsPDF, que solo se descarga al pedir un PDF). **No se guarda en el servidor**: se puede generar cuando se quiera desde el Historial.

- **Cuándo**: al **cerrar la agenda**, y con **📄 PDF** en el Historial o en modo consulta.
- **Formato**: carta horizontal.
- **Encabezado** en cada página: escudo (`public/escudo.png`), "INSTITUCIÓN EDUCATIVA JESÚS REY", NIT, DANE, núcleo y resoluciones.
- **Portada**: "AGENDA SEMANAL No. N", fechas, imagen de portada y texto introductorio.
- **Páginas siguientes**: por cada día con actividades, tabla **Hora entrada · Hora salida · Propósito pedagógico-administrativo · Espacio-lugar · Líder del encuentro · Observaciones**, ordenada por hora. Si un día no cabe, sigue con "(continuación)".
- **No incluye la columna Creador.**
- **Pie**: dirección, celular, correo, web y "Página X de Y".
- **Nombre del archivo**: `AGENDA SEMANA N DEL 23 AL 27 DE NOVIEMBRE_2026.pdf`.

---

## 6. Datos — `server/agenda.sqlite`

Todo se guarda en un solo archivo SQLite:

| Tabla | Contenido |
|---|---|
| `agendas` | Número, fechas, texto, imagen de portada, quién la creó, si está cerrada |
| `actividades` | Fecha, horas, propósito, espacio, líder, observaciones, creador |
| `usuarios` | Docentes y admin (contraseña cifrada, clave temporal) |
| `espacios` / `lideres` | Listas de Espacio y Líder |
| `usuarios_activos` | Quién está conectado (temporal) |

---

## 7. Otros detalles
- La página está marcada en español (`lang="es"`, `translate="no"`) para que Chrome no la traduzca. Título de la pestaña: "Agenda Semanal - I.E. Jesús Rey".
- **WhatsApp (CallMeBot)** — *preparado, no activo*: el servidor avisaría al crear y al cerrar una agenda, pero no hay pantalla para configurar teléfonos, así que hoy no se envía nada.

---

## 8. Problemas pendientes

| # | Gravedad | Problema |
|---|---|---|
| 1 | 🔴 Seguridad | **Se puede crear la contraseña de un usuario sin saber la clave temporal.** El servidor confía en un dato que envía el navegador (`temp_verificada`). |
| 2 | 🔴 Seguridad | **La carpeta `server/` se publica en internet** (se comprobó: `.../server/escudo.png` se descarga). Probablemente también `server/agenda.sqlite`. |
| 3 | 🟠 Seguridad | `/api/usuarios` (sin login) devuelve también teléfono y clave CallMeBot. |
| 4 | 🟠 Funcional | Si el servidor rechaza un guardado (cruce de espacio, agenda cerrada, sin sesión), **no se muestra el error** y aparece "✓ Guardado". |
| 5 | 🟡 Funcional | El admin ve activo el ✕ en actividades de otros, pero el servidor no lo deja borrarlas (falla sin mensaje). |
| 6 | 🟡 Funcional | Tras un Restart, quien tenía la página abierta ve "No hay agenda activa" en vez de volver al login. |
| 7 | 🟡 Uso | **Reiniciar clave** no pide confirmación. |
| 8 | 🟡 Datos | Las claves temporales se guardan sin cifrar. |

---

## 9. Próximo paso
- **2026-11-24 — Prueba piloto completa** (lista de pasos en [ESTADO_PROYECTO.md](ESTADO_PROYECTO.md#estado-actual-2026-11-23)). Los cambios que salgan de la prueba se anotan aquí.

---

## Historial de cambios (2026-11-23)
- Eliminar usuario: ahora borra definitivamente.
- Número de agenda automático (mayor + 1); no se permite repetir número al editar.
- Fecha fin automática (viernes) y aviso si el inicio no es lunes.
- Página en español: Chrome ya no la traduce.
- "👥 conectados" muestra quiénes son.
- Actualización automática cada 10 s con lo de los demás usuarios.
- Campo Líder con texto libre.
- Corregido: la hora del reloj se guarda al instante con el valor correcto.
- PDF de la agenda (diseño PHP, sin Creador) y Historial con 👁 Ver y 📄 PDF.
- **Cerrar y descargar PDF** en la pantalla de actividades: cierra, descarga el PDF, avisa de la próxima agenda y al aceptar abre el formulario ya relleno (para cambiar texto, imagen, etc.).
- Barra superior común; menú del admin: Actividades · Historial · Usuarios. Quitados "Administrar" y "Datos de la agenda".
- Validaciones: salida después de la entrada; fecha fin no anterior al inicio; no crear agendas en semanas pasadas.
- Código publicado en GitHub: https://github.com/plucky64git/esumerAgenda

## Historial de cambios (2026-11-24)
- Cierre de sesión por inactividad: aviso a los 28 min y cierre a los 30 min.
- Encabezados de la tabla iguales a la agenda en papel (Entrada y Salida se mantienen).
- Campo ESPACIO - LUGAR con texto libre (con sugerencias); los nombres de la lista se corrigen solos para el control de cruces.
- Barra superior fija al desplazarse; "By Poncho 2026" ya no se monta sobre el nombre.
- Casilla "Durante la jornada" para actividades sin hora fija (no bloquean espacios, van de primeras, también en el PDF).
