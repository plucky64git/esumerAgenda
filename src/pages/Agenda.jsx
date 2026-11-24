import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/Agenda.css';
import RelojVisual from '../components/RelojVisual';
import { generarPdfAgenda } from '../utils/pdfAgenda';
import BarraSuperior from '../components/BarraSuperior';
import { semanaSiguiente } from '../utils/fechas';

const API = 'https://esumeragenda.setelleva.com/api';

const ESPACIOS_CONFLICTO = ['Auditorio', 'Biblioteca', 'PTA', 'Patio Central', 'Rectoría'];

function horaAMin(h) {
    if (!h) return -1;
    const m = h.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return -1;
    let hora = parseInt(m[1]), min = parseInt(m[2]);
    const p = (m[3] || '').toUpperCase();
    if (p === 'PM' && hora !== 12) hora += 12;
    if (p === 'AM' && hora === 12) hora = 0;
    return hora * 60 + min;
}

// Actividad sin hora fija: se guarda este texto en horaEntrada (y horaSalida vacía).
// No bloquea espacios: horaAMin devuelve -1 y el control de cruces la ignora.
const JORNADA = 'DURANTE LA JORNADA';
const esJornada = h => (h || '').trim().toUpperCase() === JORNADA;

// true si ambas horas están puestas y la salida no es posterior a la entrada
function horasInvalidas(act) {
    if (!act.horaEntrada || !act.horaSalida) return false;
    return horaAMin(act.horaSalida) <= horaAMin(act.horaEntrada);
}

// Quita espacios sobrantes, mayúsculas y tildes para comparar nombres
function normalizarTexto(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Si el texto escrito coincide con un espacio de la lista, devuelve su nombre exacto;
// si no, devuelve el texto tal cual (sin espacios sobrantes).
function espacioOficial(texto, espacios) {
    const limpio = (texto || '').trim().replace(/\s+/g, ' ');
    const n = normalizarTexto(limpio);
    const nombres = [...espacios.map(e => e.nombre), ...ESPACIOS_CONFLICTO];
    return nombres.find(nombre => normalizarTexto(nombre) === n) || limpio;
}

function detectarConflictos(acts) {
    const conflictos = new Set();
    for (let i = 0; i < acts.length; i++) {
        const a1 = acts[i];
        if (!ESPACIOS_CONFLICTO.includes(a1.espacio)) continue;
        const e1 = horaAMin(a1.horaEntrada), s1 = horaAMin(a1.horaSalida);
        if (e1 < 0 || s1 < 0 || e1 >= s1) continue;
        for (let j = 0; j < acts.length; j++) {
            if (i === j) continue;
            const a2 = acts[j];
            if (a2.espacio !== a1.espacio) continue;
            const e2 = horaAMin(a2.horaEntrada), s2 = horaAMin(a2.horaSalida);
            if (e2 < 0 || s2 < 0 || e2 >= s2) continue;
            if (e1 < s2 && s1 > e2) { conflictos.add(i); conflictos.add(j); }
        }
    }
    return conflictos;
}

function Agenda() {
    const navigate = useNavigate();
    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const token = localStorage.getItem('token');

    const [agenda, setAgenda] = useState(null);
    const [esAdmin, setEsAdmin] = useState(false);
    const [usuarioActualId, setUsuarioActualId] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [diaActivo, setDiaActivo] = useState(0);
    const [conectados, setConectados] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [espacios, setEspacios] = useState([]);
    const [lideres, setLideres] = useState([]);
    const [reloj, setReloj] = useState({ visible: false, fecha: null, index: null, campo: null, valor: '' });

    const authHeader = { 'Authorization': token, 'Content-Type': 'application/json' };

    // Modo consulta: /agenda?id=N abre una agenda concreta (del historial) en solo lectura
    const [searchParams] = useSearchParams();
    const consultaId = searchParams.get('id');
    const urlCargar = consultaId ? `${API}/cargar?id=${encodeURIComponent(consultaId)}` : `${API}/cargar`;
    const soloLectura = !!consultaId || !!agenda?.bloqueada;
    const [generandoPdf, setGenerandoPdf] = useState(false);

    const descargarPdf = async () => {
        if (!agenda) return;
        setGenerandoPdf(true);
        try { await generarPdfAgenda(agenda); }
        catch (e) { alert('No se pudo generar el PDF.'); }
        setGenerandoPdf(false);
    };

    // Datos de la próxima agenda que se muestran en el mensaje después de cerrar
    const [proximaAgenda, setProximaAgenda] = useState(null);


    // Cierra la agenda, descarga el PDF y muestra el mensaje de la próxima agenda
    const cerrarYDescargarPdf = async () => {
        if (!agenda) return;
        if (!confirm(`¿Cerrar la Agenda #${agenda.numeroAgenda} y descargar el PDF? Ya no se podrán hacer cambios.`)) return;
        setGenerandoPdf(true);
        try {
            const res = await fetch(`${API}/cerrar-agenda`, {
                method: 'POST',
                headers: authHeader,
                body: JSON.stringify({ agendaId: agenda.agendaId })
            });
            const data = await res.json();
            if (!data.success) { alert(data.error || 'No se pudo cerrar la agenda.'); setGenerandoPdf(false); return; }
            setAgenda(prev => prev ? { ...prev, bloqueada: true } : prev);
            try { await generarPdfAgenda(agenda); } catch (e) { alert('La agenda se cerró, pero no se pudo generar el PDF.'); }

            // Número siguiente = el mayor que exista + 1
            let maxNumero = parseInt(agenda.numeroAgenda) || 0;
            try {
                const resL = await fetch(`${API}/listar`, { headers: { 'Authorization': token } });
                const dataL = await resL.json();
                if (dataL.success) dataL.agendas.forEach(a => { maxNumero = Math.max(maxNumero, parseInt(a.numero_agenda) || 0); });
            } catch (e) {}

            const sig = semanaSiguiente(agenda.fechaFin);
            setProximaAgenda({
                numero: maxNumero + 1,
                inicio: sig.inicio,
                fin: sig.fin,
                texto: agenda.textoIntroductorio || '',
                imagen: agenda.imagenPortada || ''
            });
        } catch (e) {
            alert('Error de conexión con el servidor.');
        }
        setGenerandoPdf(false);
    };

    // Al aceptar el mensaje: abrir el formulario de la nueva agenda (ya relleno) para cambiar texto, imagen, etc.
    const iniciarProximaAgenda = () => {
        setProximaAgenda(null);
        navigate('/admin');
    };

    useEffect(() => {
        if (!token || !usuario) { navigate('/login'); return; }
        cargarAgenda();
        cargarEspaciosYLideres();
    }, []);

    // Refs para saber, dentro del intervalo, si el usuario está editando
    const relojAbiertoRef = useRef(false);
    const guardandoRef = useRef(false);
    useEffect(() => { relojAbiertoRef.current = reloj.visible; }, [reloj.visible]);

    const estaEditando = () => {
        if (relojAbiertoRef.current || guardandoRef.current) return true;
        // Solo cuenta como "editando" un campo editable de la tabla (no botones ni celdas de solo lectura)
        const el = document.activeElement;
        if (!el || !el.closest || !el.closest('.activities-table')) return false;
        const tag = el.tagName;
        if (tag === 'SELECT') return true;
        if (tag === 'INPUT' && el.type === 'checkbox') return false; // la casilla se guarda al instante
        if ((tag === 'INPUT' || tag === 'TEXTAREA') && !el.readOnly) return true;
        return false;
    };

    // Trae las actividades nuevas de otros usuarios sin pisar lo que se está escribiendo
    const refrescarActividades = async () => {
        if (estaEditando()) return;
        try {
            const res = await fetch(urlCargar, { headers: { 'Authorization': token } });
            const data = await res.json();
            if (!data.success || !data.agenda || estaEditando()) return;
            setAgenda(prev => {
                if (!prev || prev.agendaId !== data.agenda.agendaId) return data.agenda;
                // Conservar filas nuevas que aún no se han guardado
                const diasData = { ...data.agenda.diasData };
                for (const f in prev.diasData) {
                    const pendientes = prev.diasData[f].filter(a => !a.id);
                    if (pendientes.length) diasData[f] = [...(diasData[f] || []), ...pendientes];
                }
                return { ...data.agenda, diasData };
            });
        } catch (e) {}
    };

    useEffect(() => {
        if (!agenda) return;
        const ping = () => {
            // En modo consulta no se cuenta como "conectado"
            if (!consultaId) {
                fetch(`${API}/presencia?agenda_id=${agenda.agendaId}`, { headers: { 'Authorization': token } })
                    .then(r => r.json())
                    .then(data => { if (data.success) setConectados(data.conectados); });
            }
            refrescarActividades();
        };
        ping();
        const interval = setInterval(ping, 10000);
        return () => clearInterval(interval);
    }, [agenda?.agendaId]);

    const cargarAgenda = async () => {
        setCargando(true);
        const res = await fetch(urlCargar, { headers: { 'Authorization': token } });
        const data = await res.json();
        setEsAdmin(data.esAdmin);
        setUsuarioActualId(data.usuarioActualId);
        setAgenda(data.agenda);
        setCargando(false);
    };

    const cargarEspaciosYLideres = async () => {
        const [resE, resL] = await Promise.all([
            fetch(`${API}/espacios`, { headers: { 'Authorization': token } }),
            fetch(`${API}/lideres`, { headers: { 'Authorization': token } })
        ]);
        const [dataE, dataL] = await Promise.all([resE.json(), resL.json()]);
        if (dataE.success) setEspacios(dataE.espacios);
        if (dataL.success) setLideres(dataL.lideres);
    };

    const logout = async () => {
        await fetch(`${API}/logout`, { method: 'POST', headers: { 'Authorization': token } });
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
    };

    const generarDias = () => {
        if (!agenda) return [];
        const dias = [];
        const inicio = new Date(agenda.fechaInicio + 'T00:00:00');
        const fin = new Date(agenda.fechaFin + 'T00:00:00');
        const curr = new Date(inicio);
        while (curr <= fin) {
            dias.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
        }
        return dias;
    };

    const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const formatFecha = (fechaStr) => {
        const d = new Date(fechaStr + 'T00:00:00');
        return `${DIAS_ES[d.getDay()]} ${d.getDate()} de ${MESES_ES[d.getMonth()]}`;
    };

    const formatHora = (h) => {
        if (!h) return '--:--';
        const [hh, mm] = h.split(':');
        let hora = parseInt(hh);
        const p = hora >= 12 ? 'PM' : 'AM';
        if (hora > 12) hora -= 12;
        if (hora === 0) hora = 12;
        return `${String(hora).padStart(2, '0')}:${mm} ${p}`;
    };

    const abrirReloj = (fecha, index, campo, valorActual) => {
        setReloj({ visible: true, fecha, index, campo, valor: valorActual });
    };

    const cerrarReloj = () => setReloj({ visible: false, fecha: null, index: null, campo: null, valor: '' });

    const aceptarReloj = (nuevaHora) => {
        const { fecha, index, campo } = reloj;
        actualizarCampo(fecha, index, campo, nuevaHora);
        guardandoRef.current = true; // bloquear refresco antes de cerrar el reloj
        cerrarReloj();
        guardarFila(fecha, index, { [campo]: nuevaHora });
    };

    const agregarFila = (fecha) => {
        setAgenda(prev => {
            const nuevasActs = [...(prev.diasData[fecha] || []), {
                id: null,
                horaEntrada: '',
                horaSalida: '',
                proposito: '',
                espacio: '',
                lider: '',
                observaciones: '',
                creadoPor: usuarioActualId,
                creadorNombre: `${usuario.nombre} ${usuario.apellidos}`,
                esMio: true,
                esNueva: true
            }];
            return { ...prev, diasData: { ...prev.diasData, [fecha]: nuevasActs } };
        });
    };

    // Casilla "Durante la jornada": reemplaza las horas por el aviso (o las limpia al desmarcar)
    const cambiarJornada = (fecha, index, marcar) => {
        const cambios = marcar ? { horaEntrada: JORNADA, horaSalida: '' } : { horaEntrada: '', horaSalida: '' };
        setAgenda(prev => {
            const acts = [...(prev.diasData[fecha] || [])];
            acts[index] = { ...acts[index], ...cambios };
            return { ...prev, diasData: { ...prev.diasData, [fecha]: acts } };
        });
        guardarFila(fecha, index, cambios);
    };

    const actualizarCampo = (fecha, index, campo, valor) => {
        setAgenda(prev => {
            const acts = [...(prev.diasData[fecha] || [])];
            acts[index] = { ...acts[index], [campo]: valor };
            return { ...prev, diasData: { ...prev.diasData, [fecha]: acts } };
        });
    };

    // cambios: valores recién elegidos que aún no están en el estado (ej. la hora del reloj)
    const guardarFila = async (fecha, index, cambios = {}) => {
        const acts = [...(agenda.diasData[fecha] || [])];
        if (acts[index]) acts[index] = { ...acts[index], ...cambios };
        const act = acts[index];
        // Una fila nueva se guarda cuando tiene propósito u hora; una ya guardada siempre se actualiza
        if (!act || (!act.proposito && !act.horaEntrada && !act.id)) { guardandoRef.current = false; return; }

        // Hora de salida debe ser posterior a la de entrada
        if (horasInvalidas(act)) { guardandoRef.current = false; return; }

        const conflictos = detectarConflictos(acts);
        if (conflictos.has(index)) { guardandoRef.current = false; return; }

        setGuardando(true);
        guardandoRef.current = true;
        setTimeout(() => { guardandoRef.current = false; }, 15000); // por si falla la red
        const res = await fetch(`${API}/guardar-actividad`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                agendaId: agenda.agendaId,
                actividadId: act.id,
                fecha,
                horaEntrada: act.horaEntrada,
                horaSalida: act.horaSalida,
                proposito: act.proposito,
                espacio: act.espacio,
                lider: act.lider,
                observaciones: act.observaciones
            })
        });
        const data = await res.json();
        if (data.success) {
            setAgenda(prev => {
                const updatedActs = [...(prev.diasData[fecha] || [])];
                updatedActs[index] = { ...updatedActs[index], id: data.actividadId, esNueva: false };
                return { ...prev, diasData: { ...prev.diasData, [fecha]: updatedActs } };
            });
        }
        guardandoRef.current = false;
        setTimeout(() => setGuardando(false), 1500);
    };

    const eliminarFila = async (fecha, index) => {
        const acts = agenda.diasData[fecha] || [];
        const act = acts[index];

        if (!act.id) {
            setAgenda(prev => {
                const updatedActs = (prev.diasData[fecha] || []).filter((_, i) => i !== index);
                return { ...prev, diasData: { ...prev.diasData, [fecha]: updatedActs } };
            });
            return;
        }

        const res = await fetch(`${API}/eliminar-actividad`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ actividadId: act.id })
        });
        const data = await res.json();
        if (data.success) {
            setAgenda(prev => {
                const updatedActs = (prev.diasData[fecha] || []).filter((_, i) => i !== index);
                return { ...prev, diasData: { ...prev.diasData, [fecha]: updatedActs } };
            });
        }
    };

    if (cargando) return <div style={{ textAlign: 'center', padding: '60px', fontSize: '18px' }}>Cargando agenda...</div>;

    const dias = generarDias();

    return (
        <div>
            <BarraSuperior
                usuario={usuario}
                esAdmin={esAdmin}
                conectados={conectados}
                seccionActual={consultaId ? 'historial' : 'actividades'}
                onIrA={s => {
                    if (s === 'actividades') { if (consultaId) navigate('/agenda'); }
                    else navigate(`/admin?seccion=${s}`);
                }}
                onCerrarPdf={esAdmin && agenda && !soloLectura ? cerrarYDescargarPdf : null}
                onDescargarPdf={esAdmin && agenda && soloLectura ? descargarPdf : null}
                generandoPdf={generandoPdf}
                onSalir={logout}
            />

            {!agenda ? (
                <div className="main-container">
                    <div className="no-agenda-message">
                        <div className="icon">📅</div>
                        <h2>No hay agenda activa</h2>
                        <p>El administrador debe crear una agenda para que puedas registrar tus actividades.</p>
                        {esAdmin && (
                            <button className="btn btn-primary" style={{ marginTop: '20px', display: 'block', width: '100%' }} onClick={() => navigate('/admin')}>
                                Soy un administrador
                            </button>
                        )}
                        <button onClick={logout} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '13px' }}>
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            ) : (
                <div className="main-container">
                    {consultaId && (
                        <div className="agenda-consulta-banner">
                            <span>👁 Consultando la Agenda #{agenda.numeroAgenda} — solo lectura</span>
                            <button onClick={() => navigate('/admin?seccion=historial')}>← Volver al historial</button>
                        </div>
                    )}
                    {agenda.bloqueada && !consultaId && (
                        <div className="agenda-bloqueada-banner">
                            🔒 Esta agenda está cerrada. No se pueden realizar cambios.
                        </div>
                    )}
                    {dias.some(f => detectarConflictos(agenda.diasData[f] || []).size > 0) && (
                        <div className="conflicto-banner">
                            Conflicto de horario: dos actividades usan el mismo espacio. Cambie el horario, el espacio, o elimine una actividad.
                        </div>
                    )}

                    <div className="header-info">
                        {agenda.imagenPortada && (
                            <img src={agenda.imagenPortada} alt="Portada" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid white', marginBottom: '10px' }} />
                        )}
                        <h1>Agenda #{agenda.numeroAgenda}</h1>
                        <p>{formatFecha(agenda.fechaInicio)} — {formatFecha(agenda.fechaFin)}</p>
                        {agenda.textoIntroductorio && (
                            <p style={{ marginTop: '8px', fontSize: '14px', opacity: 0.9 }}>{agenda.textoIntroductorio}</p>
                        )}
                    </div>

                    <div className="tabs">
                        {dias.map((fecha, i) => {
                            const d = new Date(fecha + 'T00:00:00');
                            return (
                                <button
                                    key={fecha}
                                    className={`tab ${diaActivo === i ? 'active' : ''}`}
                                    onClick={() => setDiaActivo(i)}
                                >
                                    {DIAS_ES[d.getDay()]}
                                </button>
                            );
                        })}
                    </div>

                    {dias.map((fecha, i) => {
                        const actsHoy = agenda.diasData[fecha] || [];
                        const indicesConflicto = detectarConflictos(actsHoy);
                        return (
                        <div key={fecha} className={`day-content ${diaActivo === i ? 'active' : ''}`}>
                            <div className="day-header">
                                <h3>{formatFecha(fecha)}</h3>
                            </div>

                            <table className="activities-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '6%' }} title="Durante la jornada (sin hora fija)">Jornada</th>
                                        <th style={{ width: '9%' }}>Entrada</th>
                                        <th style={{ width: '9%' }}>Salida</th>
                                        <th style={{ width: '20%' }}>PROPÓSITO PEDAGÓGICO - ADMINISTRATIVO</th>
                                        <th style={{ width: '17%' }}>ESPACIO - LUGAR</th>
                                        <th style={{ width: '17%' }}>LIDER DEL ENCUENTRO</th>
                                        <th style={{ width: '12%' }}>OBSERVACIONES</th>
                                        <th style={{ width: '8%' }}>Creador</th>
                                        <th style={{ width: '3%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {actsHoy.map((act, idx) => {
                                        const tieneConflicto = indicesConflicto.has(idx);
                                        const malHora = horasInvalidas(act);
                                        const estiloHora = {
                                            width: '100%', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', textAlign: 'center',
                                            border: malHora ? '1px solid #dc3545' : '1px solid #ced4da',
                                            background: malHora ? '#fff5f5' : 'white'
                                        };
                                        return (
                                        <tr key={act.id || `new-${idx}`}>
                                            <td className="td-jornada">
                                                {act.esMio && !soloLectura && (
                                                    <input
                                                        type="checkbox"
                                                        className="chk-jornada"
                                                        title="Durante la jornada (sin hora fija)"
                                                        checked={esJornada(act.horaEntrada)}
                                                        onChange={e => cambiarJornada(fecha, idx, e.target.checked)}
                                                    />
                                                )}
                                            </td>
                                            {esJornada(act.horaEntrada) ? (
                                            <td colSpan={2}>
                                                <div className="celda-jornada">DURANTE LA JORNADA</div>
                                            </td>
                                            ) : (<>
                                            <td style={{ position: 'relative' }}>
                                                {malHora && (
                                                    <div className="tooltip-conflicto">La salida debe ser después de la entrada</div>
                                                )}
                                                {act.esMio && !soloLectura ? (
                                                    <button
                                                        style={estiloHora}
                                                        onClick={() => abrirReloj(fecha, idx, 'horaEntrada', act.horaEntrada)}
                                                    >
                                                        {act.horaEntrada ? formatHora(act.horaEntrada) : '-- : --'}
                                                    </button>
                                                ) : (
                                                    <input value={act.horaEntrada ? formatHora(act.horaEntrada) : ''} readOnly style={{ background: '#e9ecef' }} />
                                                )}
                                            </td>
                                            <td>
                                                {act.esMio && !soloLectura ? (
                                                    <button
                                                        style={estiloHora}
                                                        onClick={() => abrirReloj(fecha, idx, 'horaSalida', act.horaSalida)}
                                                    >
                                                        {act.horaSalida ? formatHora(act.horaSalida) : '-- : --'}
                                                    </button>
                                                ) : (
                                                    <input value={act.horaSalida ? formatHora(act.horaSalida) : ''} readOnly style={{ background: '#e9ecef' }} />
                                                )}
                                            </td>
                                            </>)}
                                            <td>
                                                <textarea
                                                    value={act.proposito || ''}
                                                    readOnly={!act.esMio || soloLectura}
                                                    onChange={e => actualizarCampo(fecha, idx, 'proposito', e.target.value)}
                                                    onBlur={() => act.esMio && !soloLectura && guardarFila(fecha, idx)}
                                                    placeholder={act.esMio ? 'Descripción de la actividad' : ''}
                                                />
                                            </td>
                                            <td style={{ position: 'relative' }}>
                                                {act.esMio && !soloLectura ? (
                                                    <input
                                                        type="text"
                                                        list="lista-espacios"
                                                        value={act.espacio || ''}
                                                        onChange={e => actualizarCampo(fecha, idx, 'espacio', e.target.value)}
                                                        onBlur={() => {
                                                            // Si lo escrito es un espacio de la lista (sin importar mayúsculas,
                                                            // tildes o espacios), se guarda con el nombre exacto, para que el
                                                            // control de cruces lo reconozca.
                                                            const oficial = espacioOficial(act.espacio, espacios);
                                                            if (oficial !== act.espacio) {
                                                                actualizarCampo(fecha, idx, 'espacio', oficial);
                                                                guardarFila(fecha, idx, { espacio: oficial });
                                                            } else {
                                                                guardarFila(fecha, idx);
                                                            }
                                                        }}
                                                        placeholder="Escriba o elija"
                                                        style={tieneConflicto ? { borderColor: '#dc3545', background: '#fff5f5' } : {}}
                                                    />
                                                ) : (
                                                    <input value={act.espacio || ''} readOnly style={tieneConflicto ? { borderColor: '#dc3545', background: '#fff5f5' } : {}} />
                                                )}
                                                {tieneConflicto && (
                                                    <div className="tooltip-conflicto">Conflicto: mismo lugar y hora</div>
                                                )}
                                            </td>
                                            <td>
                                                {act.esMio && !soloLectura ? (
                                                    <input
                                                        type="text"
                                                        list="lista-lideres"
                                                        value={act.lider || ''}
                                                        onChange={e => actualizarCampo(fecha, idx, 'lider', e.target.value)}
                                                        onBlur={() => guardarFila(fecha, idx)}
                                                        placeholder="Escriba o elija"
                                                    />
                                                ) : (
                                                    <input value={act.lider || ''} readOnly />
                                                )}
                                            </td>
                                            <td>
                                                <textarea
                                                    value={act.observaciones || ''}
                                                    readOnly={!act.esMio || soloLectura}
                                                    onChange={e => actualizarCampo(fecha, idx, 'observaciones', e.target.value)}
                                                    onBlur={() => act.esMio && !soloLectura && guardarFila(fecha, idx)}
                                                />
                                            </td>
                                            <td>
                                                <span className={`creador-badge ${act.esMio ? 'mio' : ''}`}>
                                                    {act.esMio ? 'Yo' : (act.creadorNombre || '?')}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="btn-delete-row"
                                                    onClick={() => eliminarFila(fecha, idx)}
                                                    disabled={(!act.esMio && !esAdmin) || soloLectura}
                                                    title="Eliminar"
                                                >✕</button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {!soloLectura && (
                                <button className="btn-add-row" onClick={() => agregarFila(fecha)}>
                                    + Agregar actividad
                                </button>
                            )}
                        </div>
                        );
                    })}

                    {/* Sugerencias para el campo Espacio (se puede escribir cualquier lugar) */}
                    <datalist id="lista-espacios">
                        {espacios.map(e => (
                            <option key={e.id} value={e.nombre} />
                        ))}
                    </datalist>

                    {/* Sugerencias para el campo Líder (se puede escribir cualquier nombre) */}
                    <datalist id="lista-lideres">
                        {lideres.map(l => (
                            <option key={l.id} value={`${l.nombre} ${l.apellidos}`} />
                        ))}
                    </datalist>

                    {guardando && <div className="save-indicator">✓ Guardado</div>}
                </div>
            )}

            {/* Mensaje después de cerrar: inicia la próxima agenda */}
            {proximaAgenda && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '10px', padding: '28px', maxWidth: '440px', width: '100%', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                        <h2 style={{ color: '#1a3a6e', marginBottom: '12px' }}>Agenda #{agenda?.numeroAgenda} cerrada</h2>
                        <p style={{ color: '#444', marginBottom: '8px' }}>El PDF se descargó.</p>
                        <p style={{ color: '#222', marginBottom: '22px' }}>
                            Iniciarás la <strong>Agenda #{proximaAgenda.numero}</strong><br />
                            del <strong>{formatFecha(proximaAgenda.inicio)}</strong> al <strong>{formatFecha(proximaAgenda.fin)}</strong>.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={iniciarProximaAgenda}>
                            Aceptar
                        </button>
                    </div>
                </div>
            )}

            {reloj.visible && (
                <RelojVisual
                    valor={reloj.valor}
                    onAceptar={aceptarReloj}
                    onCancelar={cerrarReloj}
                />
            )}
        </div>
    );
}

export default Agenda;
