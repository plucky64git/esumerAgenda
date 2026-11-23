import { useState } from 'react';

const SIZE = 240;
const CENTER = SIZE / 2;
const NUM_RADIUS = 88;
const HAND_RADIUS = 70;
const DOT_R = 20;

function RelojVisual({ valor, onAceptar, onCancelar }) {
    const parseValor = (v) => {
        if (!v) return { hora: 8, min: 0, periodo: 'AM' };
        const match = v.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
            let h = parseInt(match[1]);
            const m = parseInt(match[2]);
            const p = h >= 12 ? 'PM' : 'AM';
            if (h > 12) h -= 12;
            if (h === 0) h = 12;
            return { hora: h, min: m, periodo: p };
        }
        return { hora: 8, min: 0, periodo: 'AM' };
    };

    const ini = parseValor(valor);
    const [hora, setHora] = useState(ini.hora);
    const [min, setMin] = useState(ini.min);
    const [periodo, setPeriodo] = useState(ini.periodo);
    const [modo, setModo] = useState('hora');

    const HORAS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const MINS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const getPos = (i, r) => {
        const angle = (i * 30 - 90) * Math.PI / 180;
        return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
    };

    const selectedI = modo === 'hora'
        ? HORAS.indexOf(hora)
        : MINS.indexOf(min) === -1 ? 0 : MINS.indexOf(min);

    const handPos = getPos(selectedI, HAND_RADIUS);

    const handleNumClick = (n, e) => {
        e.stopPropagation();
        if (modo === 'hora') {
            setHora(n);
            setTimeout(() => setModo('min'), 250);
        } else {
            setMin(n);
        }
    };

    const aceptar = () => {
        let h = hora;
        if (periodo === 'AM' && h === 12) h = 0;
        if (periodo === 'PM' && h !== 12) h += 12;
        onAceptar(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    };

    const lista = modo === 'hora' ? HORAS : MINS;

    return (
        <div style={sOverlay}>
            <div style={sModal}>
                <h3 style={{ color: '#1a3a6e', textAlign: 'center', marginBottom: '15px', fontSize: '17px' }}>
                    Seleccione la hora
                </h3>

                {/* Display digital */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <div onClick={() => setModo('hora')} style={{ ...sDigit, background: modo === 'hora' ? '#1a3a6e' : '#e9ecef', color: modo === 'hora' ? 'white' : '#333' }}>
                        {String(hora).padStart(2, '0')}
                    </div>
                    <span style={{ fontSize: '30px', fontWeight: 'bold', color: '#333', lineHeight: 1 }}>:</span>
                    <div onClick={() => setModo('min')} style={{ ...sDigit, background: modo === 'min' ? '#1a3a6e' : '#e9ecef', color: modo === 'min' ? 'white' : '#333' }}>
                        {String(min).padStart(2, '0')}
                    </div>
                </div>

                {/* Reloj SVG */}
                <svg width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto', cursor: 'pointer' }}>
                    <circle cx={CENTER} cy={CENTER} r={CENTER - 4} fill="#f5f7fa" stroke="#dee2e6" strokeWidth="1.5" />
                    <line x1={CENTER} y1={CENTER} x2={handPos.x} y2={handPos.y} stroke="#1a3a6e" strokeWidth="2" strokeLinecap="round" />
                    <circle cx={CENTER} cy={CENTER} r="4" fill="#1a3a6e" />
                    {lista.map((n, i) => {
                        const pos = getPos(i, NUM_RADIUS);
                        const sel = modo === 'hora' ? hora === n : min === n;
                        return (
                            <g key={n} onClick={e => handleNumClick(n, e)} style={{ cursor: 'pointer' }}>
                                <circle cx={pos.x} cy={pos.y} r={DOT_R} fill={sel ? '#1a3a6e' : 'transparent'} />
                                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                                    fontSize="13" fontWeight={sel ? 'bold' : 'normal'}
                                    fill={sel ? 'white' : '#333'} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                                    {modo === 'hora' ? n : String(n).padStart(2, '0')}
                                </text>
                            </g>
                        );
                    })}
                    <circle cx={handPos.x} cy={handPos.y} r="7" fill="#1a3a6e" />
                </svg>

                {/* AM / PM */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
                    <button onClick={() => setPeriodo('AM')} style={{ ...sAmPm, background: periodo === 'AM' ? '#1a3a6e' : 'white', color: periodo === 'AM' ? 'white' : '#1a3a6e' }}>AM</button>
                    <button onClick={() => setPeriodo('PM')} style={{ ...sAmPm, background: periodo === 'PM' ? '#1a3a6e' : 'white', color: periodo === 'PM' ? 'white' : '#1a3a6e' }}>PM</button>
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button onClick={onCancelar} style={sBtnCancel}>Cancelar</button>
                    <button onClick={aceptar} style={sBtnOk}>Aceptar</button>
                </div>
            </div>
        </div>
    );
}

const sOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 };
const sModal = { background: 'white', borderRadius: '16px', padding: '25px 20px', width: '90%', maxWidth: '310px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' };
const sDigit = { padding: '8px 14px', borderRadius: '8px', fontSize: '30px', fontWeight: 'bold', minWidth: '66px', textAlign: 'center', cursor: 'pointer' };
const sAmPm = { padding: '8px 24px', border: '2px solid #1a3a6e', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' };
const sBtnCancel = { flex: 1, padding: '12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' };
const sBtnOk = { flex: 1, padding: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' };

export default RelojVisual;
