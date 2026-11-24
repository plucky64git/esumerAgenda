const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'https://esumeragenda.setelleva.com', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Sesiones simples en memoria
const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSession(req) {
    const token = req.headers['authorization'];
    return token ? sessions[token] : null;
}

// Base de datos
const db = new DatabaseSync(path.join(__dirname, 'agenda.sqlite'));
db.exec('PRAGMA foreign_keys = ON');

// Asegurar columnas necesarias
db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios_activos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        agenda_id INTEGER NOT NULL,
        ultimo_ping DATETIME NOT NULL,
        UNIQUE(usuario_id, agenda_id)
    )
`);

try { db.exec('ALTER TABLE actividades ADD COLUMN creado_por INTEGER DEFAULT NULL'); } catch(e) {}
try { db.exec('ALTER TABLE agendas ADD COLUMN cerrada INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN telefono TEXT DEFAULT NULL'); } catch(e) {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN callmebot_key TEXT DEFAULT NULL'); } catch(e) {}

// ==================== AUTH ====================

// Login - paso 1: obtener usuarios
app.get('/api/usuarios', (req, res) => {
    const usuarios = db.prepare('SELECT id, nombre, apellidos, telefono, callmebot_key FROM usuarios WHERE activo = 1 ORDER BY nombre').all();
    res.json({ success: true, usuarios });
});

// Login - verificar usuario y contraseña
app.post('/api/login', (req, res) => {
    const { usuario_id, password, password_temp, nueva_password, temp_verificada } = req.body;

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(usuario_id);
    if (!usuario) return res.json({ success: false, error: 'Usuario no encontrado' });

    if (usuario.password) {
        // Tiene contraseña personal
        if (!password) return res.json({ success: false, paso: 4 });

        const coincide = bcrypt.compareSync(password, usuario.password);
        if (!coincide) return res.json({ success: false, error: 'Contraseña incorrecta', paso: 4 });
        const token = generateToken();
        sessions[token] = { usuario_id: usuario.id, nombre: usuario.nombre, apellidos: usuario.apellidos, es_admin: usuario.es_admin };
        return res.json({ success: true, token, usuario: sessions[token] });
    } else {
        // Sin contraseña personal, flujo temporal
        if (temp_verificada) {
            if (!nueva_password) return res.json({ success: false, paso: 3 });
            const hash = bcrypt.hashSync(nueva_password, 10);
            db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hash, usuario_id);
            const token = generateToken();
            sessions[token] = { usuario_id: usuario.id, nombre: usuario.nombre, apellidos: usuario.apellidos, es_admin: usuario.es_admin };
            return res.json({ success: true, token, usuario: sessions[token] });
        }

        if (!password_temp) return res.json({ success: false, paso: 2 });

        if (password_temp === usuario.password_temp) {
            return res.json({ success: false, paso: 3, temp_verificada: true });
        } else {
            return res.json({ success: false, error: 'Contraseña temporal incorrecta', paso: 2 });
        }
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    const token = req.headers['authorization'];
    if (token) delete sessions[token];
    res.json({ success: true });
});

// ==================== AGENDA ====================

// Cargar agenda activa o por ID
app.get('/api/cargar', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const { id, desde, hasta } = req.query;
    let agenda = null;

    if (desde && hasta) {
        agenda = db.prepare('SELECT * FROM agendas WHERE fecha_inicio <= ? AND fecha_fin >= ? ORDER BY id DESC LIMIT 1').get(hasta, desde);
    } else if (id) {
        agenda = db.prepare('SELECT * FROM agendas WHERE id = ?').get(id);
    } else {
        agenda = db.prepare('SELECT * FROM agendas WHERE cerrada = 0 OR cerrada IS NULL ORDER BY id DESC LIMIT 1').get();
    }

    if (!agenda) return res.json({ success: true, esAdmin: session.es_admin == 1, usuarioActualId: session.usuario_id, agenda: null });

    const actividades = db.prepare(`
        SELECT a.*, u.nombre as creador_nombre, u.apellidos as creador_apellidos
        FROM actividades a
        LEFT JOIN usuarios u ON a.creado_por = u.id
        WHERE a.agenda_id = ?
    `).all(agenda.id);

    actividades.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        // "Durante la jornada" va de primero en el día
        const ja = esJornada(a.hora_entrada), jb = esJornada(b.hora_entrada);
        if (ja !== jb) return ja ? -1 : 1;
        return horaAMinutos(a.hora_entrada) - horaAMinutos(b.hora_entrada);
    });

    const diasData = {};
    actividades.forEach(act => {
        if (!diasData[act.fecha]) diasData[act.fecha] = [];
        diasData[act.fecha].push({
            id: act.id,
            horaEntrada: act.hora_entrada,
            horaSalida: act.hora_salida,
            proposito: act.proposito,
            espacio: act.espacio,
            lider: act.lider,
            observaciones: act.observaciones,
            creadoPor: act.creado_por,
            creadorNombre: ((act.creador_nombre || '') + ' ' + (act.creador_apellidos || '')).trim(),
            esMio: act.creado_por == session.usuario_id
        });
    });

    res.json({
        success: true,
        esAdmin: session.es_admin == 1,
        usuarioActualId: session.usuario_id,
        agenda: {
            agendaId: agenda.id,
            numeroAgenda: agenda.numero_agenda,
            fechaInicio: agenda.fecha_inicio,
            fechaFin: agenda.fecha_fin,
            textoIntroductorio: agenda.texto_introductorio,
            imagenPortada: agenda.imagen_portada,
            diasData,
            bloqueada: agenda.cerrada == 1
        }
    });
});

// Crear o actualizar agenda
app.post('/api/guardar', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador puede crear agendas' });

    const { agendaId, numeroAgenda, fechaInicio, fechaFin, textoIntroductorio, imagenPortada } = req.body;

    if (!fechaInicio || !fechaFin) return res.json({ success: false, error: 'Las fechas son obligatorias' });
    if (fechaFin < fechaInicio) return res.json({ success: false, error: 'La fecha fin no puede ser anterior a la fecha de inicio' });

    if (agendaId) {
        const repetido = db.prepare('SELECT id FROM agendas WHERE numero_agenda = ? AND id != ?').get(numeroAgenda, agendaId);
        if (repetido) return res.json({ success: false, error: `Ya existe otra agenda con el número #${numeroAgenda}` });
        db.prepare('UPDATE agendas SET numero_agenda=?, fecha_inicio=?, fecha_fin=?, texto_introductorio=?, imagen_portada=? WHERE id=?')
            .run(numeroAgenda, fechaInicio, fechaFin, textoIntroductorio, imagenPortada, agendaId);
        return res.json({ success: true, agendaId });
    }

    // Una agenda nueva no puede empezar en una semana pasada (hora de Colombia, UTC-5)
    const hoyCO = new Date(Date.now() - 5 * 3600 * 1000);
    const lunesCO = new Date(Date.UTC(hoyCO.getUTCFullYear(), hoyCO.getUTCMonth(), hoyCO.getUTCDate() - ((hoyCO.getUTCDay() + 6) % 7)));
    if (fechaInicio < lunesCO.toISOString().slice(0, 10)) {
        return res.json({ success: false, error: 'No se puede crear una agenda en una semana que ya pasó' });
    }

    const existeNumero = db.prepare('SELECT id FROM agendas WHERE numero_agenda = ?').get(numeroAgenda);
    if (existeNumero) return res.json({ success: false, error: `Ya existe una agenda con el número #${numeroAgenda}` });

    const existeFecha = db.prepare('SELECT id, numero_agenda FROM agendas WHERE fecha_inicio <= ? AND fecha_fin >= ?').get(fechaFin, fechaInicio);
    if (existeFecha) return res.json({ success: false, error: `Ya existe la agenda #${existeFecha.numero_agenda} con ese bloque de fechas` });

    const result = db.prepare('INSERT INTO agendas (numero_agenda, fecha_inicio, fecha_fin, texto_introductorio, imagen_portada, usuario_id, cerrada) VALUES (?,?,?,?,?,?,0)')
        .run(numeroAgenda, fechaInicio, fechaFin, textoIntroductorio, imagenPortada, session.usuario_id);

    notificarTodos(`📅 Agenda #${numeroAgenda} abierta del ${fechaInicio} al ${fechaFin}. ¡Ya pueden registrar actividades!`);
    res.json({ success: true, agendaId: result.lastInsertRowid });
});

// Guardar actividad individual
app.post('/api/guardar-actividad', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const { agendaId, actividadId, fecha, horaEntrada, horaSalida, proposito, espacio, lider, observaciones } = req.body;

    const agenda = db.prepare('SELECT cerrada FROM agendas WHERE id = ?').get(agendaId);
    if (!agenda) return res.json({ success: false, error: 'Agenda no encontrada' });
    if (agenda.cerrada == 1) return res.json({ success: false, error: 'Esta agenda está cerrada', bloqueado: true });

    // La hora de salida debe ser posterior a la de entrada
    if (horaEntrada && horaSalida && horaAMinutos(horaSalida) <= horaAMinutos(horaEntrada)) {
        return res.json({ success: false, error: 'La hora de salida debe ser después de la hora de entrada' });
    }

    // Verificar cruce de espacio (solo en espacios compartidos)
    const espaciosConflicto = ['Auditorio', 'Biblioteca', 'PTA', 'Patio Central', 'Rectoría'];
    if (espacio && espaciosConflicto.includes(espacio)) {
        const ocupadas = db.prepare(
            'SELECT id, hora_entrada, hora_salida FROM actividades WHERE agenda_id = ? AND fecha = ? AND espacio = ?'
        ).all(agendaId, fecha, espacio);

        const nuevaEntrada = horaAMinutos(horaEntrada);
        const nuevaSalida = horaAMinutos(horaSalida);

        for (const oc of ocupadas) {
            if (actividadId && oc.id == actividadId) continue;
            if (nuevaEntrada < horaAMinutos(oc.hora_salida) && nuevaSalida > horaAMinutos(oc.hora_entrada)) {
                return res.json({
                    success: false,
                    error: `El espacio "${espacio}" ya está ocupado de ${oc.hora_entrada} a ${oc.hora_salida} en esa fecha`
                });
            }
        }
    }

    if (actividadId) {
        const act = db.prepare('SELECT creado_por FROM actividades WHERE id = ?').get(actividadId);
        if (act && act.creado_por != session.usuario_id) return res.json({ success: false, error: 'No tiene permiso para editar esta actividad' });

        db.prepare('UPDATE actividades SET hora_entrada=?, hora_salida=?, proposito=?, espacio=?, lider=?, observaciones=? WHERE id=?')
            .run(horaEntrada, horaSalida, proposito, espacio, lider, observaciones, actividadId);
        return res.json({ success: true, actividadId, creadoPor: session.usuario_id });
    }

    const result = db.prepare('INSERT INTO actividades (agenda_id, fecha, hora_entrada, hora_salida, proposito, espacio, lider, observaciones, creado_por) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(agendaId, fecha, horaEntrada, horaSalida, proposito, espacio, lider, observaciones, session.usuario_id);

    res.json({ success: true, actividadId: result.lastInsertRowid, creadoPor: session.usuario_id });
});

// Eliminar actividad
app.post('/api/eliminar-actividad', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const { actividadId } = req.body;
    const act = db.prepare('SELECT a.*, ag.cerrada FROM actividades a JOIN agendas ag ON a.agenda_id = ag.id WHERE a.id = ?').get(actividadId);

    if (!act) return res.json({ success: false, error: 'Actividad no encontrada' });
    if (act.cerrada == 1) return res.json({ success: false, error: 'Esta agenda está cerrada', bloqueado: true });
    if (act.creado_por != null && act.creado_por != session.usuario_id) return res.json({ success: false, error: 'Solo el creador puede eliminar esta actividad' });

    db.prepare('DELETE FROM actividades WHERE id = ?').run(actividadId);
    res.json({ success: true });
});

// Cerrar agenda
app.post('/api/cerrar-agenda', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador puede cerrar la agenda' });

    const { agendaId } = req.body;
    const result = db.prepare('UPDATE agendas SET cerrada = 1 WHERE id = ?').run(agendaId);
    if (result.changes > 0) {
        const ag = db.prepare('SELECT numero_agenda FROM agendas WHERE id = ?').get(agendaId);
        notificarTodos(`🔒 Agenda #${ag?.numero_agenda} cerrada. Ya no se pueden hacer cambios.`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'No se encontró la agenda' });
    }
});

// Guardar perfil (teléfono y API key de CallMeBot)
app.post('/api/perfil', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const { telefono, callmebot_key } = req.body;
    db.prepare('UPDATE usuarios SET telefono = ?, callmebot_key = ? WHERE id = ?')
        .run(telefono, callmebot_key, session.usuario_id);
    res.json({ success: true });
});

// Obtener perfil del usuario actual
app.get('/api/perfil', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const u = db.prepare('SELECT telefono, callmebot_key FROM usuarios WHERE id = ?').get(session.usuario_id);
    res.json({ success: true, telefono: u?.telefono || '', callmebot_key: u?.callmebot_key || '' });
});

// Guardar teléfono y API key de un usuario (admin)
app.post('/api/usuario-whatsapp', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador' });

    const { usuarioId, telefono, callmebot_key } = req.body;
    db.prepare('UPDATE usuarios SET telefono = ?, callmebot_key = ? WHERE id = ?').run(telefono, callmebot_key, usuarioId);
    res.json({ success: true });
});

// Notificar a todos los usuarios con teléfono configurado
function notificarTodos(mensaje) {
    const usuarios = db.prepare('SELECT telefono, callmebot_key FROM usuarios WHERE telefono IS NOT NULL AND callmebot_key IS NOT NULL AND activo = 1').all();
    usuarios.forEach(u => {
        if (!u.telefono || !u.callmebot_key) return;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${u.telefono}&text=${encodeURIComponent(mensaje)}&apikey=${u.callmebot_key}`;
        try { require('https').get(url); } catch(e) {}
    });
}

// Crear nuevo usuario (admin)
app.post('/api/usuario-crear', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador' });

    const { nombre, apellidos, password_temp } = req.body;
    if (!nombre || !apellidos || !password_temp) return res.json({ success: false, error: 'Todos los campos son obligatorios' });

    const result = db.prepare('INSERT INTO usuarios (nombre, apellidos, password_temp, activo, es_admin) VALUES (?, ?, ?, 1, 0)')
        .run(nombre, apellidos, password_temp);
    res.json({ success: true, id: result.lastInsertRowid });
});

// Eliminar usuario (admin) - borra el registro definitivamente
app.post('/api/usuario-eliminar', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador' });

    const { usuarioId } = req.body;
    if (usuarioId == session.usuario_id) return res.json({ success: false, error: 'No puedes eliminarte a ti mismo' });

    try {
        db.exec('BEGIN');
        // Las agendas que creó se conservan, solo se desvinculan (FK hacia usuarios)
        db.prepare('UPDATE agendas SET usuario_id = NULL WHERE usuario_id = ?').run(usuarioId);
        db.prepare('DELETE FROM usuarios_activos WHERE usuario_id = ?').run(usuarioId);
        const result = db.prepare('DELETE FROM usuarios WHERE id = ?').run(usuarioId);
        db.exec('COMMIT');

        // Cerrar sesiones abiertas de ese usuario
        for (const token in sessions) {
            if (sessions[token].usuario_id == usuarioId) delete sessions[token];
        }

        if (result.changes === 0) return res.json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true });
    } catch (e) {
        db.exec('ROLLBACK');
        res.json({ success: false, error: 'No se pudo eliminar el usuario' });
    }
});

// Resetear contraseña - genera clave aleatoria y envía por WhatsApp
app.post('/api/asignar-temp', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Solo el administrador' });

    const { usuarioId } = req.body;
    const temp = Math.random().toString(36).slice(2, 8).toUpperCase();
    db.prepare('UPDATE usuarios SET password = NULL, password_temp = ? WHERE id = ?').run(temp, usuarioId);

    res.json({ success: true, temp });
});

// Listar agendas (admin)
app.get('/api/listar', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    if (!session.es_admin) return res.json({ success: false, error: 'Acceso denegado' });

    const { desde, hasta } = req.query;
    let sql = 'SELECT a.*, u.nombre as usuario_nombre, u.apellidos as usuario_apellidos FROM agendas a LEFT JOIN usuarios u ON a.usuario_id = u.id WHERE 1=1';
    const params = [];

    if (desde) { sql += ' AND a.fecha_inicio >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND a.fecha_fin <= ?'; params.push(hasta); }
    sql += ' ORDER BY a.fecha_inicio DESC';

    const agendas = db.prepare(sql).all(...params);
    res.json({ success: true, agendas });
});

// Presencia
app.get('/api/presencia', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });

    const { agenda_id } = req.query;
    if (!agenda_id) return res.json({ success: false, error: 'Falta agenda_id' });

    db.prepare(`INSERT INTO usuarios_activos (usuario_id, agenda_id, ultimo_ping) VALUES (?, ?, datetime('now'))
        ON CONFLICT(usuario_id, agenda_id) DO UPDATE SET ultimo_ping = datetime('now')`).run(session.usuario_id, agenda_id);

    db.prepare(`DELETE FROM usuarios_activos WHERE ultimo_ping < datetime('now', '-20 seconds')`).run();

    const conectados = db.prepare(`
        SELECT ua.usuario_id, u.nombre, u.apellidos
        FROM usuarios_activos ua
        INNER JOIN usuarios u ON ua.usuario_id = u.id
        WHERE ua.agenda_id = ?
        ORDER BY u.nombre
    `).all(agenda_id).map(u => ({
        id: u.usuario_id,
        nombre: (u.nombre + ' ' + u.apellidos).trim(),
        esMio: u.usuario_id == session.usuario_id
    }));

    res.json({ success: true, conectados, total: conectados.length });
});

// Obtener espacios y líderes
app.get('/api/espacios', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    const espacios = db.prepare('SELECT id, nombre FROM espacios WHERE activo = 1 ORDER BY nombre').all();
    res.json({ success: true, espacios });
});

app.get('/api/lideres', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'No autorizado' });
    const lideres = db.prepare('SELECT id, nombre, apellidos FROM lideres WHERE activo = 1 ORDER BY apellidos, nombre').all();
    res.json({ success: true, lideres });
});

// Helper
// Actividad sin hora fija: se guarda "DURANTE LA JORNADA" en hora_entrada.
// No bloquea espacios (horaAMinutos devuelve 9999 y el control de cruces la ignora).
function esJornada(horaStr) {
    return (horaStr || '').trim().toUpperCase() === 'DURANTE LA JORNADA';
}

function horaAMinutos(horaStr) {
    if (!horaStr) return 9999;
    const match = horaStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return 9999;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const p = (match[3] || '').toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

// Servir frontend en producción
app.use(express.static(path.join(__dirname, '..')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
