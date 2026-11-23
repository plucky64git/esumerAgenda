// Utilidades de fechas de la agenda (formato 'YYYY-MM-DD', hora local)

export const fmtISO = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Lunes de la semana actual (las agendas no pueden empezar antes de esta fecha)
export function lunesSemanaActual() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diasDesdeLunes = (hoy.getDay() + 6) % 7; // lunes=0 … domingo=6
    hoy.setDate(hoy.getDate() - diasDesdeLunes);
    return fmtISO(hoy);
}

// Lunes a viernes de la semana siguiente a fechaFin.
// Si esa semana ya pasó, usa la semana actual.
export function semanaSiguiente(fechaFin) {
    const d = new Date(fechaFin + 'T00:00:00');
    let lunes = new Date(d);
    lunes.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));

    const lunesActual = new Date(lunesSemanaActual() + 'T00:00:00');
    if (lunes < lunesActual) lunes = lunesActual;

    const viernes = new Date(lunes);
    viernes.setDate(lunes.getDate() + 4);
    return { inicio: fmtISO(lunes), fin: fmtISO(viernes) };
}
