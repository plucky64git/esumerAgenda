# Estado del Proyecto — Agenda Semanal React
**Última actualización:** 2026-11-23

## ¿Qué es esto?
App web para la Institución Educativa Jesús Rey. Permite a docentes registrar actividades semanales en una agenda compartida. Reemplaza una versión anterior en PHP.

> Funcionalidades detalladas y problemas pendientes: ver [FUNCIONALIDADES.md](FUNCIONALIDADES.md)

**Stack:** React 19 + Vite (frontend) | Node.js + Express (backend) | SQLite (base de datos) | jsPDF (PDF en el navegador)

---

## Enlaces
| Qué | Link |
|---|---|
| App en producción | https://esumeragenda.setelleva.com |
| Código (GitHub, público) | https://github.com/plucky64git/esumerAgenda |

---

## Rutas en el Servidor (Linux cPanel)
```
/home/setellev/esumeragenda.setelleva.com/          ← RAÍZ: archivos de dist/ (frontend)
  ├── index.html
  ├── escudo.png
  ├── assets/          ← JS y CSS generados por el build
  └── server/          ← Backend Node.js (NO subir aquí los archivos de dist)
        ├── index.js         ← Servidor Express
        ├── agenda.sqlite    ← Base de datos (la real)
        ├── package.json
        └── node_modules/    ← Instalado con "Run NPM Install" en cPanel
```

## Rutas Locales (Windows)
```
E:\Esumer\ProyectoFinal\AgendaReact\
  ├── src/pages/       ← Login.jsx, Agenda.jsx, Admin.jsx
  ├── src/components/  ← BarraSuperior.jsx, RelojVisual.jsx
  ├── src/utils/       ← pdfAgenda.js (PDF), fechas.js (semanas)
  ├── src/styles/      ← CSS de cada página y de la barra
  ├── public/          ← escudo.png (se copia a dist/)
  ├── server/          ← index.js, agenda.sqlite, package.json
  └── dist/            ← Se genera con: npm run build
```

---

## Flujo de Despliegue (cada cambio)
1. Modificar código en local.
2. `npm run build` en la carpeta del proyecto.
3. Subir por FileZilla a la **raíz** `/home/setellev/esumeragenda.setelleva.com/` (⚠️ **no** dentro de `server/`):
   - `dist/index.html`
   - `dist/assets/` (carpeta entera)
   - `dist/escudo.png` (solo si cambió)
4. Si cambió el backend: `server/index.js` → carpeta `server/`.
5. Si se subió `server/index.js` o `agenda.sqlite`: cPanel → **Setup Node.js App** → `esumeragenda.setelleva.com` → **RESTART** (no tocar DESTROY).
6. Recargar con **Ctrl+F5**.

**Cómo verificar que quedó la versión nueva:** el nombre del archivo `assets/index-XXXX.js` dentro de `dist/index.html` debe ser el mismo que sirve el sitio (ver código fuente de la página).

**Errores que ya pasaron:**
- Subir los archivos de `dist/` dentro de `server/` → el sitio sigue mostrando la versión vieja.
- Subir `index.html` sin `assets/` (o al revés) → la página puede quedar en blanco.
- Subir `agenda.sqlite` local encima de la del servidor → se pierden los datos del servidor.

---

## Flujo con Git / GitHub
- Repositorio local creado con `git init`, remoto `origin` → https://github.com/plucky64git/esumerAgenda.git, rama **master**.
- Se sube también `server/agenda.sqlite` (decisión: el proyecto es para un examen; la BD solo tiene la clave temporal `agenda2026`).
- Cada vez que se trabaje:
  1. **pull** (bajar cambios de GitHub)
  2. cambios en el código
  3. **commit** con mensaje claro
  4. **push** (subir a GitHub)
- En VS Code: panel **Control de código fuente** → mensaje → **Confirmación** → **Sincronizar cambios**.
- El profe tiene el link público (ver y descargar). Para que pueda subir cambios hay que agregarlo como **colaborador** (Settings → Collaborators).

---

## Detalles Técnicos Importantes

### Por qué NO usa better-sqlite3
El servidor tiene GLIBC antiguo (CentOS 7). `better-sqlite3` requiere GLIBC 2.29.
**Solución:** Se usa `node:sqlite` (integrado en Node.js 24, no requiere instalación).

```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'agenda.sqlite'));
db.exec('PRAGMA foreign_keys = ON');
```

### CORS
```js
app.use(cors({ origin: 'https://esumeragenda.setelleva.com', credentials: true }));
```

### Puerto dinámico (requerido por cPanel)
```js
const PORT = process.env.PORT || 3001;
```

### Catch-all para React Router (Express 5)
```js
// app.get('*', ...) NO funciona en Express 5 — usar app.use():
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
```
Ojo: por esto, un archivo que no existe devuelve `index.html` con código 200 (no un 404).

### API URL en el frontend
```js
const API = 'https://esumeragenda.setelleva.com/api';
// — mismo valor en Login.jsx, Agenda.jsx y Admin.jsx
```

### Hora de Colombia en el servidor
La validación "no crear agendas en semanas pasadas" calcula el lunes actual con UTC-5.

---

## Backend (server/index.js) — Endpoints
| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/usuarios` | Lista de usuarios para el login |
| POST | `/api/login` | Login en 4 pasos |
| POST | `/api/logout` | Cerrar sesión |
| GET | `/api/cargar` | Agenda abierta (o `?id=N` para consultar una) con actividades |
| POST | `/api/guardar` | Crear/editar agenda (valida número, fechas, semana pasada, cruces) |
| POST | `/api/guardar-actividad` | Guardar actividad (valida horas y cruce de espacio) |
| POST | `/api/eliminar-actividad` | Eliminar actividad propia |
| POST | `/api/cerrar-agenda` | Cerrar agenda (admin) |
| GET | `/api/listar` | Historial de agendas (admin) |
| GET | `/api/presencia` | Quién está conectado |
| GET | `/api/espacios` · `/api/lideres` | Listas para la tabla |
| POST | `/api/usuario-crear` · `/api/usuario-eliminar` · `/api/asignar-temp` | Gestión de usuarios (admin) |
| GET/POST | `/api/perfil` · POST `/api/usuario-whatsapp` | WhatsApp (sin pantalla, no activo) |

---

## Estado Actual (2026-11-23)
- ✅ App desplegada y funcionando en producción.
- ✅ Código en GitHub (público) con primer commit.
- ✅ Funcionalidades completas (ver FUNCIONALIDADES.md): login, actividades en tiempo casi real, conflictos, validaciones, PDF, cierre y nueva agenda, historial, usuarios.
- ⏭️ **Próximo paso (2026-11-24): prueba piloto completa**:
  1. Login de un docente nuevo (`agenda2026` → crear contraseña).
  2. Actividades: horas al revés, conflicto de espacio, líder escrito a mano.
  3. Dos usuarios a la vez (uno en incógnito): ver lo del otro sin recargar.
  4. Cerrar y descargar PDF (revisar escudo) → formulario de la nueva agenda → Crear.
  5. Historial: 👁 Ver y 📄 PDF de una agenda vieja.
- ⚠️ Problemas pendientes (seguridad y avisos de error): ver sección 8 de FUNCIONALIDADES.md.

## Cómo Resetear Contraseña desde Terminal cPanel
```bash
source /home/setellev/nodevenv/esumeragenda.setelleva.com/server/24/bin/activate
cd /home/setellev/esumeragenda.setelleva.com/server
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('agenda.sqlite');db.prepare('UPDATE usuarios SET password=NULL WHERE nombre=?').run('NOMBRE');console.log('listo');"
```
(Más fácil: Usuarios → **Reiniciar clave** en la app.)

## Proyecto Original (referencia PHP)
```
E:\Esumer\Ejercicios\EjercicioClase10React\Lista_Tareas\Agenda_Semanal\agenda_online\
```
