# Estado del Proyecto — Agenda Semanal React
**Última actualización:** 2026-11-23

## ¿Qué es esto?
App web para la Institución Educativa Jesús Rey. Permite a docentes registrar actividades semanales en una agenda compartida. Reemplaza una versión anterior en PHP.

> Funcionalidades detalladas y problemas pendientes: ver [FUNCIONALIDADES.md](FUNCIONALIDADES.md)

**Stack:** React 19 + Vite (frontend) | Node.js + Express (backend) | SQLite (base de datos)

---

## URL de Producción
```
https://esumeragenda.setelleva.com
```

## Rutas en el Servidor (Linux cPanel)
```
/home/setellev/esumeragenda.setelleva.com/          ← Archivos React (dist/)
/home/setellev/esumeragenda.setelleva.com/server/   ← Backend Node.js
  ├── index.js         ← Servidor Express
  ├── agenda.sqlite    ← Base de datos
  ├── package.json
  └── node_modules/    ← Instalado con "Run NPM Install" en cPanel
```

## Rutas Locales (Windows)
```
E:\Esumer\ProyectoFinal\AgendaReact\
  ├── src/pages/       ← Login.jsx, Agenda.jsx, Admin.jsx
  ├── src/styles/      ← CSS de cada página
  ├── src/components/  ← RelojVisual.jsx
  ├── server/          ← index.js, agenda.sqlite, package.json
  └── dist/            ← Se genera con: npm run build
```

---

## Flujo de Despliegue (cada cambio)
1. Modificar código en local
2. `npm run build` en la carpeta del proyecto
3. Subir por FileZilla:
   - `dist/index.html` → raíz del subdominio
   - `dist/assets/` → raíz del subdominio
   - `server/index.js` → carpeta server/ (si cambió)
4. cPanel → Node.js → app `ESUMERAGENDA.SETELLEVA.COM/` → **RESTART**

---

## Detalles Técnicos Importantes

### Por qué NO usa better-sqlite3
El servidor tiene GLIBC antiguo (CentOS 7). `better-sqlite3` requiere GLIBC 2.29.
**Solución:** Se usa `node:sqlite` (integrado en Node.js 24, no requiere instalación).

```js
// server/index.js — líneas clave:
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'agenda.sqlite'));
db.exec('PRAGMA foreign_keys = ON');
```

### CORS configurado para:
```js
app.use(cors({ origin: 'https://esumeragenda.setelleva.com', credentials: true }));
```

### Puerto dinámico (requerido por cPanel):
```js
const PORT = process.env.PORT || 3001;
```

### Catch-all para React Router (Express 5):
```js
// app.get('*', ...) NO funciona en Express 5 — usar app.use():
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});
```

### API URL en el frontend:
```js
const API = 'https://esumeragenda.setelleva.com/api';
// — mismo valor en Login.jsx, Agenda.jsx y Admin.jsx
```

---

## Funcionalidades Implementadas

### Login (Login.jsx)
- Paso 1: Seleccionar usuario de lista desplegable
- Paso 2: Si no tiene contraseña personal → pide clave temporal del admin
- Paso 3: Crear contraseña personal nueva
- Paso 4: Si ya tiene contraseña → ingresar directamente

### Agenda (Agenda.jsx)
- Tabla editable por días (Lunes–Viernes)
- Campos: Hora entrada, Hora salida, Propósito, Espacio, Líder, Observaciones, Creador
- Reloj visual para seleccionar horas
- Cada usuario solo edita/elimina sus propias actividades
- Admin puede eliminar cualquiera
- **Detección de conflictos de espacio** (Auditorio, Biblioteca, PTA, Patio Central, Rectoría):
  - Tooltip rojo "Conflicto: mismo lugar y hora" sobre el campo espacio
  - Banner de error rojo arriba
  - No guarda si hay conflicto
- Presencia en tiempo real (ping cada 10s)
- Agenda bloqueada cuando admin la cierra

### Admin (Admin.jsx)
- Crear/editar agenda (número, fechas, texto introductorio, imagen)
- Cerrar agenda → pregunta si preparar la próxima semana
  - Si acepta → abre formulario con datos de la semana siguiente
  - Si cancela → cierra sesión
- Gestión de usuarios: agregar, eliminar, reiniciar clave
- Ver historial de agendas

### Backend (server/index.js)
Endpoints:
- `GET /api/usuarios` — lista usuarios activos
- `POST /api/login` — autenticación multipaso
- `POST /api/logout`
- `GET /api/cargar` — carga agenda activa con actividades
- `POST /api/guardar` — crear/editar agenda
- `POST /api/guardar-actividad` — guardar actividad (con validación de cruce de espacio)
- `POST /api/eliminar-actividad`
- `POST /api/cerrar-agenda`
- `GET /api/listar` — historial de agendas (admin)
- `GET /api/presencia` / `POST /api/presencia`
- `GET /api/espacios` — lista de espacios
- `GET /api/lideres` — lista de líderes
- `POST /api/usuario-crear`
- `POST /api/usuario-eliminar`
- `POST /api/asignar-temp` — reiniciar contraseña (genera clave aleatoria)
- `GET /api/perfil` / `POST /api/perfil`

---

## Estado Actual (2026-11-23)
- ✅ App desplegada y funcionando en producción
- ✅ Login funciona
- ✅ Conflictos de espacio implementados (backend + frontend)
- ⚠️ Pendiente: prueba completa del flujo (login → agenda → actividades → cerrar agenda)
- ⚠️ Pendiente: verificar que la BD en el servidor tenga los usuarios sin contraseñas personales (solo temp)

## Cómo Resetear Contraseña desde Terminal cPanel
```bash
source /home/setellev/nodevenv/esumeragenda.setelleva.com/server/24/bin/activate
cd /home/setellev/esumeragenda.setelleva.com/server
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('agenda.sqlite');db.prepare('UPDATE usuarios SET password=NULL WHERE nombre=?').run('NOMBRE');console.log('listo');"
```

## Proyecto Original (referencia PHP)
```
E:\Esumer\Ejercicios\EjercicioClase10React\Lista_Tareas\Agenda_Semanal\agenda_online\
```
