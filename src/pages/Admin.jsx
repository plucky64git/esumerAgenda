import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/Admin.css';
import { descargarPdfPorId } from '../utils/pdfAgenda';
import BarraSuperior from '../components/BarraSuperior';
import { semanaSiguiente, lunesSemanaActual } from '../utils/fechas';

const API = 'https://esumeragenda.setelleva.com/api';

function Admin() {
    const navigate = useNavigate();
    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const token = localStorage.getItem('token');

    const [searchParams] = useSearchParams();
    const [seccion, setSeccion] = useState(searchParams.get('seccion') || 'agenda');
    const [pdfGenerando, setPdfGenerando] = useState(null); // id de la agenda cuyo PDF se está generando
    // número de la agenda recién cerrada (llega desde la página de la agenda con ?cerrada=N)
    const [ventanaCerrada, setVentanaCerrada] = useState(searchParams.get('cerrada'));

    const descargarPdf = async (agendaId) => {
        setPdfGenerando(agendaId);
        try { await descargarPdfPorId(API, token, agendaId); }
        catch (e) { mostrarMsg('error', 'No se pudo generar el PDF.'); }
        setPdfGenerando(null);
    };
    const [agendaActiva, setAgendaActiva] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [msg, setMsg] = useState({ tipo: '', texto: '' });
    const [tempGenerado, setTempGenerado] = useState({});
    const [perfil, setPerfil] = useState({ telefono: '', callmebot_key: '' });
    const [whatsappUsuarios, setWhatsappUsuarios] = useState({});
    const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', apellidos: '', password_temp: 'agenda2026' });

    const [formAgenda, setFormAgenda] = useState({
        agendaId: '',
        numeroAgenda: '',
        fechaInicio: '',
        fechaFin: '',
        textoIntroductorio: '',
        imagenPortada: ''
    });

    const authHeader = { 'Authorization': token, 'Content-Type': 'application/json' };

    useEffect(() => {
        if (!token || !usuario || !usuario.es_admin) { navigate('/login'); return; }
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        try {
            const res = await fetch(`${API}/cargar`, { headers: { 'Authorization': token } });
            const data = await res.json();
            if (data.agenda) {
                setAgendaActiva(data.agenda);
                setFormAgenda({
                    agendaId: data.agenda.agendaId,
                    numeroAgenda: data.agenda.numeroAgenda,
                    fechaInicio: data.agenda.fechaInicio,
                    fechaFin: data.agenda.fechaFin,
                    textoIntroductorio: data.agenda.textoIntroductorio || '',
                    imagenPortada: data.agenda.imagenPortada || ''
                });
            }

            const resL = await fetch(`${API}/listar`, { headers: { 'Authorization': token } });
            const dataL = await resL.json();
            if (dataL.success) {
                setHistorial(dataL.agendas);
                // Sin agenda abierta → dejar el formulario listo con el siguiente número y semana
                if (!data.agenda) setFormAgenda(datosNuevaAgenda(dataL.agendas));
            }

            const resU = await fetch(`${API}/usuarios`, { headers: { 'Authorization': token } });
            const dataU = await resU.json();
            if (dataU.success) {
                setUsuarios(dataU.usuarios);
                const wa = {};
                dataU.usuarios.forEach(u => { wa[u.id] = { telefono: u.telefono || '', callmebot_key: u.callmebot_key || '' }; });
                setWhatsappUsuarios(wa);
            }

            try {
                const resP = await fetch(`${API}/perfil`, { headers: { 'Authorization': token } });
                const dataP = await resP.json();
                if (dataP.success) setPerfil({ telefono: dataP.telefono, callmebot_key: dataP.callmebot_key });
            } catch (e) {}
        } catch (e) {
            console.error('Error cargando datos del panel:', e);
        }
    };

    const mostrarMsg = (tipo, texto) => {
        setMsg({ tipo, texto });
        setTimeout(() => setMsg({ tipo: '', texto: '' }), 10000);
    };

    const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const diaSemana = fechaStr => fechaStr ? DIAS[new Date(fechaStr + 'T00:00:00').getDay()] : '';
    const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Viernes de la misma semana (o el siguiente viernes si inicia sábado/domingo)
    const viernesDesde = fechaStr => {
        const d = new Date(fechaStr + 'T00:00:00');
        d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
        return fmtLocal(d);
    };

    const handleFormChange = e => {
        const { name, value } = e.target;
        if (name === 'fechaInicio' && value) {
            setFormAgenda({ ...formAgenda, fechaInicio: value, fechaFin: viernesDesde(value) });
        } else {
            setFormAgenda({ ...formAgenda, [name]: value });
        }
    };

    const inicioNoEsLunes = formAgenda.fechaInicio && diaSemana(formAgenda.fechaInicio) !== 'lunes';

    const guardarAgenda = async e => {
        e.preventDefault();
        if (formAgenda.fechaFin < formAgenda.fechaInicio) {
            mostrarMsg('error', 'La fecha fin no puede ser anterior a la fecha de inicio.');
            return;
        }
        // Una agenda nueva no puede empezar en una semana pasada
        if (!formAgenda.agendaId && formAgenda.fechaInicio < lunesSemanaActual()) {
            mostrarMsg('error', 'No se puede crear una agenda en una semana que ya pasó.');
            return;
        }
        if (inicioNoEsLunes && !confirm(`La agenda está empezando un ${diaSemana(formAgenda.fechaInicio)}, no un lunes.\n\n¿Está seguro de que desea guardarla así?`)) return;
        const res = await fetch(`${API}/guardar`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify(formAgenda)
        });
        const data = await res.json();
        if (data.success) {
            // Ir directo a la agenda para empezar a registrar actividades
            navigate('/agenda');
        } else {
            mostrarMsg('error', data.error);
        }
    };

    // Calcula número (mayor existente + 1) y fechas (semana siguiente a la última agenda)
    const datosNuevaAgenda = (agendas) => {
        const vacio = { agendaId: '', numeroAgenda: '', fechaInicio: '', fechaFin: '', textoIntroductorio: '', imagenPortada: '' };
        if (!agendas || agendas.length === 0) return { ...vacio, numeroAgenda: '1' };

        const maxNumero = Math.max(...agendas.map(a => parseInt(a.numero_agenda) || 0));
        const ultima = agendas.reduce((u, a) => (a.fecha_fin > u.fecha_fin ? a : u));
        const sig = siguienteSemana(ultima.fecha_fin);
        return {
            ...vacio,
            numeroAgenda: String(maxNumero + 1),
            fechaInicio: sig.inicio,
            fechaFin: sig.fin,
            textoIntroductorio: ultima.texto_introductorio || '',
            imagenPortada: ultima.imagen_portada || ''
        };
    };

    const nuevaAgenda = () => {
        setFormAgenda(datosNuevaAgenda(historial));
        setMsg({ tipo: '', texto: '' });
    };

    const siguienteSemana = semanaSiguiente;

    const crearUsuario = async e => {
        e.preventDefault();
        const res = await fetch(`${API}/usuario-crear`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify(nuevoUsuario)
        });
        const data = await res.json();
        if (data.success) {
            mostrarMsg('success', 'Usuario creado correctamente.');
            setNuevoUsuario({ nombre: '', apellidos: '', password_temp: '' });
            cargarDatos();
        } else {
            mostrarMsg('error', data.error);
        }
    };

    const eliminarUsuario = async (usuarioId, nombre) => {
        if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
        const res = await fetch(`${API}/usuario-eliminar`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ usuarioId })
        });
        const data = await res.json();
        if (data.success) {
            mostrarMsg('success', 'Usuario eliminado.');
            cargarDatos();
        } else {
            mostrarMsg('error', data.error);
        }
    };

    const guardarWhatsappUsuario = async (usuarioId) => {
        const datos = whatsappUsuarios[usuarioId];
        const res = await fetch(`${API}/usuario-whatsapp`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ usuarioId, ...datos })
        });
        const data = await res.json();
        if (data.success) mostrarMsg('success', 'WhatsApp guardado.');
        else mostrarMsg('error', data.error);
    };

    const guardarPerfil = async e => {
        e.preventDefault();
        const res = await fetch(`${API}/perfil`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify(perfil)
        });
        const data = await res.json();
        if (data.success) mostrarMsg('success', 'Configuración de WhatsApp guardada.');
        else mostrarMsg('error', data.error);
    };

    const asignarTemp = async (usuarioId, nombre) => {
        try {
            const res = await fetch(`${API}/asignar-temp`, {
                method: 'POST',
                headers: authHeader,
                body: JSON.stringify({ usuarioId })
            });
            const data = await res.json();
            if (data.success) {
                setTempGenerado(prev => ({ ...prev, [usuarioId]: data.temp }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
                mostrarMsg('success', `🔑 Clave temporal de ${nombre}: ${data.temp}`);
            } else {
                mostrarMsg('error', data.error || 'Error al resetear');
            }
        } catch (e) {
            mostrarMsg('error', 'Error de conexión con el servidor');
        }
    };

    const formatFecha = fechaStr => {
        if (!fechaStr) return '';
        const d = new Date(fechaStr + 'T00:00:00');
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const logout = async () => {
        await fetch(`${API}/logout`, { method: 'POST', headers: { 'Authorization': token } });
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
    };

    return (
        <div className="admin-page">
            <div className="by-poncho">By Poncho 2026</div>

            {/* Ventana después de cerrar la agenda */}
            {ventanaCerrada && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '10px', padding: '28px', maxWidth: '420px', width: '100%', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                        <h2 style={{ color: '#1a3a6e', marginBottom: '12px' }}>Agenda #{ventanaCerrada} cerrada</h2>
                        <p style={{ marginBottom: '22px', color: '#444' }}>El PDF se descargó.<br />Iniciarás la agenda de la próxima semana.</p>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => { setVentanaCerrada(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        >
                            Aceptar
                        </button>
                    </div>
                </div>
            )}

            <BarraSuperior
                usuario={usuario}
                esAdmin={true}
                seccionActual={seccion}
                onIrA={s => (s === 'actividades' ? navigate('/agenda') : setSeccion(s))}
                onSalir={logout}
            />

            <div className="admin-content">

                {msg.texto && (
                    <div className={msg.tipo === 'success' ? 'msg-success' : 'msg-error'}>
                        {msg.texto}
                    </div>
                )}

                {/* ===== SECCIÓN AGENDA ===== */}
                {seccion === 'agenda' && (
                    <>
                        {agendaActiva && (
                            <div className="agenda-activa-info">
                                <div>
                                    <h4>Agenda activa: #{agendaActiva.numeroAgenda}</h4>
                                    <p>{formatFecha(agendaActiva.fechaInicio)} — {formatFecha(agendaActiva.fechaFin)}</p>
                                    <p>{agendaActiva.bloqueada ? '🔒 Cerrada' : '✅ Abierta'}</p>
                                </div>
                            </div>
                        )}

                        <div className="admin-card">
                            <h3>{formAgenda.agendaId ? `Editar Agenda #${formAgenda.numeroAgenda}` : 'Crear nueva agenda'}</h3>
                            <form onSubmit={guardarAgenda}>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Número de agenda</label>
                                        <input
                                            type="number"
                                            name="numeroAgenda"
                                            value={formAgenda.numeroAgenda}
                                            onChange={handleFormChange}
                                            required
                                            placeholder="Ej: 15"
                                            min="1"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Fecha inicio</label>
                                        <input
                                            type="date"
                                            name="fechaInicio"
                                            value={formAgenda.fechaInicio}
                                            min={formAgenda.agendaId ? undefined : lunesSemanaActual()}
                                            onChange={handleFormChange}
                                            onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                                            required
                                        />
                                        {inicioNoEsLunes && (
                                            <small style={{ display: 'block', marginTop: '6px', padding: '6px 10px', background: '#fff8e1', color: '#8a5a00', border: '1px solid #f0c36d', borderRadius: '6px' }}>
                                                ⚠️ La agenda está empezando un <strong>{diaSemana(formAgenda.fechaInicio)}</strong>. Normalmente inicia el lunes. ¿Está seguro?
                                            </small>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label>Fecha fin</label>
                                        <input
                                            type="date"
                                            name="fechaFin"
                                            value={formAgenda.fechaFin}
                                            min={formAgenda.fechaInicio || undefined}
                                            onChange={handleFormChange}
                                            onClick={e => { try { e.target.showPicker(); } catch(err) {} }}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Texto introductorio (opcional)</label>
                                    <textarea
                                        name="textoIntroductorio"
                                        value={formAgenda.textoIntroductorio}
                                        onChange={handleFormChange}
                                        placeholder="Descripción o mensaje para esta semana..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Imagen de portada (opcional)</label>
                                    {formAgenda.imagenPortada && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <img src={formAgenda.imagenPortada} alt="Portada" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #1a3a6e' }} />
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = ev => setFormAgenda(prev => ({ ...prev, imagenPortada: ev.target.result }));
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary">
                                    {formAgenda.agendaId ? 'Guardar cambios' : 'Crear agenda'}
                                </button>
                                {formAgenda.agendaId && (
                                    <button type="button" className="btn btn-secondary" style={{ marginLeft: '10px' }} onClick={nuevaAgenda}>
                                        Cancelar
                                    </button>
                                )}
                            </form>
                        </div>
                    </>
                )}

                {/* ===== SECCIÓN HISTORIAL ===== */}
                {seccion === 'historial' && (
                    <div className="admin-card">
                        <h3>Historial de agendas</h3>
                        {historial.length === 0 ? (
                            <p style={{ color: '#666' }}>No hay agendas registradas.</p>
                        ) : (
                            <table className="agendas-list">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Inicio</th>
                                        <th>Fin</th>
                                        <th>Creada por</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historial.map(a => (
                                        <tr key={a.id}>
                                            <td><strong>{a.numero_agenda}</strong></td>
                                            <td>{formatFecha(a.fecha_inicio)}</td>
                                            <td>{formatFecha(a.fecha_fin)}</td>
                                            <td>{a.usuario_nombre} {a.usuario_apellidos}</td>
                                            <td>
                                                <span className={`badge ${a.cerrada ? 'badge-closed' : 'badge-open'}`}>
                                                    {a.cerrada ? 'Cerrada' : 'Abierta'}
                                                </span>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <button className="btn btn-secondary btn-sm" style={{ marginRight: '6px' }} onClick={() => navigate(`/agenda?id=${a.id}`)}>
                                                    👁 Ver
                                                </button>
                                                <button className="btn btn-primary btn-sm" onClick={() => descargarPdf(a.id)} disabled={pdfGenerando === a.id}>
                                                    {pdfGenerando === a.id ? 'Generando…' : '📄 PDF'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* ===== SECCIÓN USUARIOS ===== */}
                {seccion === 'usuarios' && (
                    <div className="admin-card">
                        <h3>Agregar usuario</h3>
                        <form onSubmit={crearUsuario}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nombre</label>
                                    <input type="text" value={nuevoUsuario.nombre} onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} required placeholder="Nombre" />
                                </div>
                                <div className="form-group">
                                    <label>Apellidos</label>
                                    <input type="text" value={nuevoUsuario.apellidos} onChange={e => setNuevoUsuario({ ...nuevoUsuario, apellidos: e.target.value })} required placeholder="Apellidos" />
                                </div>
                                <div className="form-group">
                                    <label>Contraseña temporal</label>
                                    <input type="text" value={nuevoUsuario.password_temp} onChange={e => setNuevoUsuario({ ...nuevoUsuario, password_temp: e.target.value })} required placeholder="Ej: ABC123" />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary">+ Agregar</button>
                        </form>
                    </div>
                )}

                {seccion === 'usuarios' && (
                    <div className="admin-card">
                        <h3>Usuarios activos</h3>
                        <table className="usuarios-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usuarios.map(u => (
                                    <tr key={u.id}>
                                        <td><strong>{u.nombre} {u.apellidos}</strong></td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => asignarTemp(u.id, u.nombre)} style={{ marginRight: '6px', marginBottom: '4px' }}>
                                                Reiniciar clave
                                            </button>
                                            <button className="btn btn-danger btn-sm" onClick={() => eliminarUsuario(u.id, u.nombre)} style={{ marginBottom: '4px' }}>
                                                Eliminar
                                            </button>
                                            {tempGenerado[u.id] && (
                                                <div style={{ marginTop: '6px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' }}>
                                                    🔑 <strong>{tempGenerado[u.id]}</strong>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            </div>
        </div>
    );
}

export default Admin;
