import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';

const API = 'https://esumeragenda.setelleva.com/api';

function Login() {
    const navigate = useNavigate();
    const [usuarios, setUsuarios] = useState([]);
    const [paso, setPaso] = useState(1);
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
    const [error, setError] = useState('');
    const [tempVerificada, setTempVerificada] = useState(false);

    const [form, setForm] = useState({
        usuario_id: '',
        password_temp: '',
        password: '',
        nueva_password: '',
        confirmar_password: ''
    });

    useEffect(() => {
        fetch(`${API}/usuarios`)
            .then(r => r.json())
            .then(data => { if (data.success) setUsuarios(data.usuarios); });
    }, []);

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async e => {
        e.preventDefault();
        setError('');

        if (paso === 1) {
            const u = usuarios.find(u => u.id == form.usuario_id);
            setUsuarioSeleccionado(u);
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: parseInt(form.usuario_id) })
            });
            const data = await res.json();
            if (data.success) {
                guardarSesion(data);
            } else if (data.paso) {
                setPaso(data.paso);
            } else {
                setError(data.error);
            }
            return;
        }

        if (paso === 2) {
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: parseInt(form.usuario_id), password_temp: form.password_temp })
            });
            const data = await res.json();
            if (data.paso === 3) {
                setTempVerificada(true);
                setPaso(3);
            } else {
                setError(data.error);
            }
            return;
        }

        if (paso === 3) {
            if (form.nueva_password !== form.confirmar_password) {
                setError('Las contraseñas no coinciden');
                return;
            }
            if (form.nueva_password.length < 4) {
                setError('La contraseña debe tener al menos 4 caracteres');
                return;
            }
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: parseInt(form.usuario_id), nueva_password: form.nueva_password, temp_verificada: true })
            });
            const data = await res.json();
            if (data.success) {
                guardarSesion(data);
            } else {
                setError(data.error);
            }
            return;
        }

        if (paso === 4) {
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_id: parseInt(form.usuario_id), password: form.password })
            });
            const data = await res.json();
            if (data.success) {
                guardarSesion(data);
            } else {
                setError(data.error);
            }
            return;
        }
    };

    const guardarSesion = (data) => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('usuario', JSON.stringify(data.usuario));
        navigate('/agenda');
    };

    const volver = () => {
        setPaso(1);
        setError('');
        setUsuarioSeleccionado(null);
        setForm({ usuario_id: '', password_temp: '', password: '', nueva_password: '', confirmar_password: '' });
    };

    const nombreUsuario = usuarioSeleccionado ? `${usuarioSeleccionado.nombre} ${usuarioSeleccionado.apellidos}` : '';

    return (
        <div className="login-page">
            <div className="by-poncho">By Poncho 2026</div>
            <div className="login-container">
                <div className="logo">
                    <h1>Agenda Semanal</h1>
                    <p>Institución Educativa Jesús Rey</p>
                </div>

                {error && <div className="error">{error}</div>}

                {paso === 1 && (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Seleccione su usuario:</label>
                            <select name="usuario_id" value={form.usuario_id} onChange={handleChange} required>
                                <option value="">-- Seleccione --</option>
                                {usuarios.map(u => (
                                    <option key={u.id} value={u.id}>{u.nombre} {u.apellidos}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary">Continuar</button>
                    </form>
                )}

                {paso === 2 && (
                    <form onSubmit={handleSubmit}>
                        <div className="selected-user">
                            <strong>{nombreUsuario}</strong>
                        </div>
                        <div className="warning">
                            Ingrese la contraseña temporal proporcionada por el administrador.
                        </div>
                        <div className="form-group">
                            <label>Contraseña temporal:</label>
                            <input type="password" name="password_temp" value={form.password_temp} onChange={handleChange} required placeholder="Contraseña del administrador" autoFocus />
                        </div>
                        <button type="submit" className="btn btn-primary">Verificar</button>
                        <button type="button" className="btn btn-secondary" onClick={volver}>Volver</button>
                    </form>
                )}

                {paso === 3 && (
                    <form onSubmit={handleSubmit}>
                        <div className="selected-user">
                            <strong>{nombreUsuario}</strong>
                        </div>
                        <div className="info">
                            Cree su contraseña personal para futuros ingresos.
                        </div>
                        <div className="form-group">
                            <label>Nueva contraseña:</label>
                            <input type="password" name="nueva_password" value={form.nueva_password} onChange={handleChange} required minLength={4} placeholder="Mínimo 4 caracteres" autoFocus />
                        </div>
                        <div className="form-group">
                            <label>Confirmar contraseña:</label>
                            <input type="password" name="confirmar_password" value={form.confirmar_password} onChange={handleChange} required minLength={4} />
                        </div>
                        <button type="submit" className="btn btn-primary">Crear y Entrar</button>
                        <button type="button" className="btn btn-secondary" onClick={volver}>Volver</button>
                    </form>
                )}

                {paso === 4 && (
                    <form onSubmit={handleSubmit}>
                        <div className="selected-user">
                            <strong>{nombreUsuario}</strong>
                        </div>
                        <div className="form-group">
                            <label>Contraseña:</label>
                            <input type="password" name="password" value={form.password} onChange={handleChange} required placeholder="Ingrese su contraseña" autoFocus />
                        </div>
                        <button type="submit" className="btn btn-primary">Ingresar</button>
                        <button type="button" className="btn btn-secondary" onClick={volver}>Volver</button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default Login;
