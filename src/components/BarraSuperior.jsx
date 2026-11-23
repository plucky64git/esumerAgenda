import { useState } from 'react';
import '../styles/BarraSuperior.css';

// Barra superior común a la pantalla de actividades y al panel del admin.
// - Izquierda: usuario y conectados
// - Centro (solo admin): menú de secciones
// - Derecha: Cerrar y descargar PDF (si aplica) y Salir
//
// seccionActual: 'actividades' | 'agenda' | 'historial' | 'usuarios'
// onIrA(seccion): navega a la sección elegida
function BarraSuperior({ usuario, esAdmin, conectados = [], seccionActual, onIrA, onCerrarPdf, onDescargarPdf, generandoPdf, onSalir }) {
    const [verConectados, setVerConectados] = useState(false);

    const MENU = [
        { id: 'actividades', texto: 'Actividades' },
        { id: 'historial', texto: 'Historial' },
        { id: 'usuarios', texto: 'Usuarios' }
    ];

    return (
        <div className="barra-superior">
            <div className="barra-izq">
                <span className="barra-nombre">{usuario?.nombre} {usuario?.apellidos}</span>
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
        </div>
    );
}

export default BarraSuperior;
