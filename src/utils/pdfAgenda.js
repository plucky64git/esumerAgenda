// Generación del PDF de la agenda semanal (mismo diseño que la versión PHP).
// No incluye la columna "Creador".
// jsPDF se carga solo al generar un PDF (no pesa en la carga inicial)

const AZUL = [26, 58, 110];
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const COLS = [25, 25, 70, 35, 45, 50];
const HEADERS = ['HORA ENTRADA', 'HORA SALIDA', 'PROPÓSITO PEDAGÓGICO - ADMINISTRATIVO', 'ESPACIO - LUGAR', 'LÍDER DEL ENCUENTRO', 'OBSERVACIONES'];

const fecha = str => new Date(str + 'T00:00:00');
const fechaTexto = d => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const horaAMin = h => {
    const m = (h || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return 9999;
    let hh = parseInt(m[1]);
    const p = (m[3] || '').toUpperCase();
    if (p === 'PM' && hh !== 12) hh += 12;
    if (p === 'AM' && hh === 12) hh = 0;
    return hh * 60 + parseInt(m[2]);
};

const esJornada = h => (h || '').trim().toUpperCase() === 'DURANTE LA JORNADA';

const horaTexto = h => {
    if (!h) return '';
    if (esJornada(h)) return 'Durante la jornada';
    if (/AM|PM/i.test(h)) return h;
    const [hh, mm] = h.split(':');
    let n = parseInt(hh);
    const p = n >= 12 ? 'PM' : 'AM';
    if (n > 12) n -= 12;
    if (n === 0) n = 12;
    return `${String(n).padStart(2, '0')}:${mm} ${p}`;
};

let escudoCache = null;
async function cargarEscudo() {
    if (escudoCache) return escudoCache;
    try {
        escudoCache = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = '/escudo.png';
        });
    } catch (e) {
        escudoCache = null;
    }
    return escudoCache;
}

function encabezadoPagina(doc, ancho, altura, escudo) {
    if (escudo) {
        try { doc.addImage(escudo, 'PNG', 5, 2, altura - 4, altura - 4); } catch (e) {}
    }
    const xc = ancho / 2 - 20;
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('INSTITUCIÓN EDUCATIVA', xc, 6, { align: 'center' });
    doc.setFontSize(16);
    doc.text('JESÚS REY', xc, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('NIT: 811.018.233-0     DANE: 105001014851     Núcleo Educativo: 922', xc, 18, { align: 'center' });

    const xd = ancho - 85;
    doc.setFontSize(5);
    doc.text('•  Resolución de Reconocimiento de Carácter Oficial 14674 del 17 de', xd, 4);
    doc.text('   octubre de 2002,', xd, 7);
    doc.text('•  Modificada por las resoluciones 16244 del 27 de noviembre de 2002,', xd, 10);
    doc.text('•  201850050021 del 16 de julio de 2018 que autoriza jornada única y', xd, 14);
    doc.text('•  20235005858972 del 28 de julio de 2023 que autoriza media técnica', xd, 18);
    doc.text('   en TICS', xd, 21);

    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.8);
    doc.line(0, altura, ancho, altura);
}

function piePagina(doc, ancho, alto, altura, pag, total) {
    const y = alto - altura;
    const yt = y + 7;
    const s = ancho / 4;
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.8);
    doc.line(0, y, ancho, y);
    doc.setTextColor(...AZUL);
    doc.setFontSize(7);
    [
        ['Dirección:', 'Carrera 88# 77ª – 11, Robledo Aures 1'],
        ['Celular:', '300 417 6296'],
        ['Correo electrónico:', 'ie.jesusrey@iejesusrey.edu.co'],
        ['Página Web:', 'www.iejesusrey.edu.co']
    ].forEach(([t, v], i) => {
        doc.setFont('helvetica', 'bold');
        doc.text(t, s * (i + 0.5), yt - 2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text(v, s * (i + 0.5), yt + 2, { align: 'center' });
    });
    doc.setLineWidth(0.3);
    [1, 2, 3].forEach(i => doc.line(s * i, y + 2, s * i, y + altura - 5));
    doc.setFontSize(8);
    doc.text(`Página ${pag} de ${total}`, ancho / 2, y - 2, { align: 'center' });
}

function tituloSemana(doc, datos, ancho, margen, y) {
    doc.setFillColor(...AZUL);
    doc.rect(margen, y, ancho - margen * 2, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`AGENDA SEMANAL No. ${datos.numero} - ${fechaTexto(datos.inicio)} al ${fechaTexto(datos.fin)}`, ancho / 2, y + 8, { align: 'center' });
    return y + 16;
}

function barraDia(doc, dia, ancho, margen, y, continuacion) {
    doc.setFillColor(...AZUL);
    doc.rect(margen, y, ancho - margen * 2, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${DIAS[dia.getDay()]} ${dia.getDate()} DE ${MESES[dia.getMonth()]} DE ${dia.getFullYear()}${continuacion ? ' (continuación)' : ''}`, ancho / 2, y + 5.5, { align: 'center' });
    y += 10;

    doc.setFillColor(180, 200, 225);
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    let x = margen;
    COLS.forEach(w => { doc.rect(x, y, w, 8, 'FD'); x += w; });
    doc.setTextColor(...AZUL);
    doc.setFontSize(8);
    x = margen;
    HEADERS.forEach((h, i) => { doc.text(h, x + COLS[i] / 2, y + 5.5, { align: 'center' }); x += COLS[i]; });
    doc.setFont('helvetica', 'normal');
    return y + 8;
}

/**
 * agenda: objeto que devuelve /api/cargar (numeroAgenda, fechaInicio, fechaFin, textoIntroductorio, imagenPortada, diasData)
 */
export async function generarPdfAgenda(agenda) {
    const { jsPDF } = await import('jspdf');
    const escudo = await cargarEscudo();
    const doc = new jsPDF('landscape', 'mm', 'letter');
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const margen = 10;
    const altEnc = 28, altPie = 18;
    const yContenido = altEnc + 5;
    const limite = alto - altPie - 12;

    const datos = {
        numero: agenda.numeroAgenda,
        inicio: fecha(agenda.fechaInicio),
        fin: fecha(agenda.fechaFin),
        texto: agenda.textoIntroductorio || '',
        imagen: agenda.imagenPortada || null
    };

    // ---- Portada ----
    encabezadoPagina(doc, ancho, altEnc, escudo);
    const yt = yContenido + 5;
    doc.setFillColor(...AZUL);
    doc.rect(margen, yt, ancho - margen * 2, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(`AGENDA SEMANAL No. ${datos.numero}`, ancho / 2, yt + 10, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${fechaTexto(datos.inicio)} - ${fechaTexto(datos.fin)}`, ancho / 2, yt + 20, { align: 'center' });

    let y = yt + 35;
    if (datos.imagen) {
        try {
            const tipo = datos.imagen.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(datos.imagen, tipo, (ancho - 60) / 2, y, 60, 60);
            y += 70;
        } catch (e) {}
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(datos.texto, ancho - margen * 4), ancho / 2, y, { align: 'center' });

    // ---- Actividades ----
    doc.addPage();
    encabezadoPagina(doc, ancho, altEnc, escudo);
    y = tituloSemana(doc, datos, ancho, margen, yContenido);

    const cur = new Date(datos.inicio);
    while (cur <= datos.fin) {
        const f = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const acts = (agenda.diasData?.[f] || [])
            .filter(a => a.horaEntrada || a.proposito)
            .sort((a, b) => {
                // "Durante la jornada" va de primero
                const ja = esJornada(a.horaEntrada), jb = esJornada(b.horaEntrada);
                if (ja !== jb) return ja ? -1 : 1;
                return horaAMin(a.horaEntrada) - horaAMin(b.horaEntrada);
            });

        if (acts.length) {
            const dia = new Date(cur);
            if (y + 8 + 10 + 8 + 10 + 5 > limite) {
                doc.addPage();
                encabezadoPagina(doc, ancho, altEnc, escudo);
                y = tituloSemana(doc, datos, ancho, margen, yContenido);
            }
            y = barraDia(doc, dia, ancho, margen, y, false);

            acts.forEach((act, idx) => {
                // "Durante la jornada" ocupa las dos columnas de hora en una sola celda
                const jornada = esJornada(act.horaEntrada);
                const cols = jornada ? [COLS[0] + COLS[1], ...COLS.slice(2)] : COLS;
                const valores = jornada
                    ? ['DURANTE LA JORNADA', act.proposito, act.espacio, act.lider, act.observaciones]
                    : [horaTexto(act.horaEntrada), horaTexto(act.horaSalida), act.proposito, act.espacio, act.lider, act.observaciones];
                doc.setFontSize(8);
                const lineas = valores.map((v, i) => doc.splitTextToSize(v || '', cols[i] - 4));
                const altFila = Math.max(10, Math.max(...lineas.map(l => l.length)) * 4 + 4);

                if (y + altFila > limite) {
                    doc.addPage();
                    encabezadoPagina(doc, ancho, altEnc, escudo);
                    y = tituloSemana(doc, datos, ancho, margen, yContenido);
                    y = barraDia(doc, dia, ancho, margen, y, true);
                    doc.setFontSize(8);
                }

                let x = margen;
                doc.setDrawColor(180, 180, 180);
                doc.setFillColor(...(idx % 2 === 0 ? [248, 249, 250] : [255, 255, 255]));
                cols.forEach(w => { doc.rect(x, y, w, altFila, 'FD'); x += w; });

                doc.setTextColor(0, 0, 0);
                x = margen;
                lineas.forEach((ls, i) => {
                    ls.forEach((l, li) => doc.text(l, x + 2, y + 5 + li * 4));
                    x += cols[i];
                });
                y += altFila;
            });
            y += 8;
        }
        cur.setDate(cur.getDate() + 1);
    }

    // ---- Pie y numeración ----
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        piePagina(doc, ancho, alto, altPie, i, total);
    }

    doc.save(`AGENDA SEMANA ${datos.numero} DEL ${datos.inicio.getDate()} AL ${datos.fin.getDate()} DE ${MESES[datos.inicio.getMonth()]}_${datos.inicio.getFullYear()}.pdf`);
}

// Trae una agenda por id desde el servidor y genera su PDF
export async function descargarPdfPorId(API, token, agendaId) {
    const res = await fetch(`${API}/cargar?id=${agendaId}`, { headers: { 'Authorization': token } });
    const data = await res.json();
    if (!data.success || !data.agenda) throw new Error(data.error || 'No se pudo cargar la agenda');
    await generarPdfAgenda(data.agenda);
}
