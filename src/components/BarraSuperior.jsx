import { useState, useEffect, useRef } from 'react';
import '../styles/BarraSuperior.css';

// Cierre de sesión por inactividad
const MIN_INACTIVIDAD = 30;  // a los 30 min sin actividad se cierra la sesión
const MIN_AVISO = 28;        // a los 28 min se muestra el aviso
const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'];

// Barra superior común a la pantalla de actividades y al panel del admin.
// - Izquierda: usuario y conectados
// - Centro (solo admin): menú de secciones
// - Derecha: Cerrar y descargar PDF (si aplica) y Salir
//
// seccionActual: 'actividades' | 'agenda' | 'historial' | 'usuarios'
// onIrA(seccion): navega a la sección elegida
function BarraSuperior({ usuario, esAdmin, conectados = [], seccionActual, onIrA, onCerrarPdf, onDescargarPdf, generandoPdf, onSalir }) {
    const [verConectados, setVerConectados] = useState(false);

    // --- Inactividad ---
    // Solo cuentan las acciones del usuario (mouse, teclado, desplazamiento).
    // La actualización automática cada 10 s NO cuenta.
    const ultimaActividadRef = useRef(Date.now());
    const avisoVisibleRef = useRef(false);
    const salidaHechaRef = useRef(false);
    const onSalirRef = useRef(onSalir);
    onSalirRef.current = onSalir;
    const [segundosRestantes, setSegundosRestantes] = useState(null); // null = sin aviso

    useEffect(() => {
        const registrarActividad = () => {
            // Con el aviso en pantalla, solo el botón "Seguir aquí" reinicia el tiempo
            if (!avisoVisibleRef.current) ultimaActividadRef.current = Date.now();
        };
        EVENTOS_ACTIVIDAD.forEach(ev => window.addEventListener(ev, registrarActividad, { passive: true }));

        const intervalo = setInterval(() => {
            const inactivoMs = Date.now() - ultimaActividadRef.current;
            if (inactivoMs >= MIN_INACTIVIDAD * 60000) {
                if (!salidaHechaRef.current) {
                    salidaHechaRef.current = true;
                    setSegundosRestantes(null);
                    // Primero se cierra la sesión (también en el servidor) y luego se avisa
                    Promise.resolve(onSalirRef.current?.()).finally(() =>
                        alert('Tu sesión se cerró por inactividad (30 minutos). Vuelve a ingresar.')
                    );
                }
            } else if (inactivoMs >= MIN_AVISO * 60000) {
                avisoVisibleRef.current = true;
                setSegundosRestantes(Math.ceil((MIN_INACTIVIDAD * 60000 - inactivoMs) / 1000));
            }
        }, 1000);

        return () => {
            EVENTOS_ACTIVIDAD.forEach(ev => window.removeEventListener(ev, registrarActividad));
            clearInterval(intervalo);
        };
    }, []);

    const seguirAqui = () => {
        avisoVisibleRef.current = false;
        ultimaActividadRef.current = Date.now();
        setSegundosRestantes(null);
    };

    const MENU = [
        { id: 'actividades', texto: 'Actividades' },
        { id: 'historial', texto: 'Historial' },
        { id: 'usuarios', texto: 'Usuarios' }
    ];

    return (
        <div className="barra-superior">
            <div className="barra-izq">
                <div className="barra-identidad">
                    <span className="barra-firma">By Poncho 2026</span>
                    <span className="barra-nombre">{usuario?.nombre} {usuario?.apellidos}</span>
                </div>
                {esAdmin && <span className="barra-rol">ADMIN</span>}
                {conectados.length > 0 && (
                    <div
                        className="barra-conectados"
                        onClick={() => setVerConectados(v => !v)}
                        title={conectados.map(c => c.nombre).join('\n')}
                    >
                        👥 {conectados.length} conectado{conectados.length !== 1 ? 's' : ''} {verConectados ? '▲' : '▼'}
                        {verConectados && (
                            <ul className="lista-conectados">
                                {conectados.map(c => (
                                    <li key={c.id}>
                                        <span className="punto-verde"></span>
                                        {c.nombre}{c.esMio ? ' (yo)' : ''}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {esAdmin && (
                <nav className="barra-menu">
                    {MENU.map(m => (
                        <button
                            key={m.id}
                            className={`barra-menu-btn ${seccionActual === m.id ? 'activo' : ''}`}
                            onClick={() => onIrA(m.id)}
                        >
                            {m.texto}
                        </button>
                    ))}
                </nav>
            )}

            <div className="barra-der">
                {onCerrarPdf && (
                    <button className="barra-btn barra-btn-pdf" onClick={onCerrarPdf} disabled={generandoPdf}>
                        {generandoPdf ? 'Generando…' : '🔒 Cerrar y descargar PDF'}
                    </button>
                )}
                {onDescargarPdf && (
                    <button className="barra-btn barra-btn-pdf" onClick={onDescargarPdf} disabled={generandoPdf}>
                        {generandoPdf ? 'Generando…' : '📄 PDF'}
                    </button>
                )}
                <button className="barra-btn barra-btn-salir" onClick={onSalir}>Salir</button>
            </div>

            {segundosRestantes !== null && (
                <div className="aviso-inactividad-fondo">
                    <div className="aviso-inactividad">
                        <h3>⏰ ¿Sigues ahí?</h3>
                        <p>
                            Tu sesión se cerrará por inactividad en{' '}
                            <strong>
                                {Math.floor(segundosRestantes / 60)}:{String(segundosRestantes % 60).padStart(2, '0')}
                            </strong>
                        </p>
                        <button className="aviso-inactividad-btn" onClick={seguirAqui}>Seguir aquí</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BarraSuperior;
