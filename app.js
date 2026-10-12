/* EXAM EASY · web de captura del alumno
 * Copyright (c) 2026 Miguel Usabel. Todos los derechos reservados.
 * Todo ocurre en el móvil: las fotos no se envían a ningún sitio; el alumno guarda un PDF y lo sube al formulario del profesor. */
(() => {
  'use strict';
  const VERSION = '0.2.0';
  const MAX_LADO = 1600;        // píxeles del lado mayor de cada página en el PDF
  const CALIDAD_JPEG = 0.82;
  const LADO_ANALISIS = 400;    // tamaño de trabajo para las comprobaciones
  const UMBRAL_BORROSA = 60;    // varianza del laplaciano por debajo = borrosa
  const UMBRAL_OSCURA = 90;     // luminancia media por debajo = oscura
  const UMBRAL_BORDE = 0.85;    // fracción de píxeles claros en el borde = hoja cortada

  const $ = (s) => document.querySelector(s);
  const ui = {
    profesor: $('#profesor'), curso: $('#curso'), asignatura: $('#asignatura'), parcial: $('#parcial'), examen: $('#examen'), formulario: $('#formulario'),
    resumen: $('#resumen-examen'), btnEditar: $('#btn-editar-examen'), formExamen: $('#form-examen'),
    apellidos: $('#apellidos'), nombre: $('#nombre'),
    lista: $('#lista-paginas'), nPaginas: $('#n-paginas'), siguiente: $('#siguiente'),
    btnFoto: $('#btn-foto'), btnGaleria: $('#btn-galeria'), inputCamara: $('#input-camara'), inputGaleria: $('#input-galeria'),
    aviso: $('#aviso'), avisoImg: $('#aviso-img'), avisoLista: $('#aviso-lista'), btnRepetir: $('#btn-repetir'), btnUsar: $('#btn-usar'),
    btnPdf: $('#btn-pdf'), pdfInfo: $('#pdf-info'), btnFormulario: $('#btn-formulario'), btnCompartir: $('#btn-compartir'),
    estado: $('#estado'), version: $('#version'),
  };
  ui.version.textContent = 'v' + VERSION;

  // ---------- datos del examen: vienen en el QR (?p=&c=&a=&x=&e=&f=) ----------
  const params = new URLSearchParams(location.search);
  const mapa = { p: 'profesor', c: 'curso', a: 'asignatura', x: 'parcial', e: 'examen', f: 'formulario' };
  let desdeQr = true;
  for (const [k, id] of Object.entries(mapa)) {
    const v = (params.get(k) || '').trim();
    ui[id].value = v;
    if (!v && k !== 'p') desdeQr = false;
  }
  function pintarResumen() {
    const partes = [ui.curso.value, ui.asignatura.value, ui.parcial.value, ui.examen.value].filter(Boolean);
    ui.resumen.textContent = partes.join(' · ') + (ui.profesor.value ? ' · ' + ui.profesor.value : '');
  }
  if (desdeQr) {
    pintarResumen();
    ui.resumen.hidden = false;
    ui.btnEditar.hidden = false;
    ui.formExamen.hidden = true;
  }
  ui.btnEditar.addEventListener('click', () => { ui.formExamen.hidden = false; ui.btnEditar.hidden = true; ui.resumen.hidden = true; });

  // ---------- alumno: se recuerda en este móvil ----------
  try {
    ui.apellidos.value = localStorage.getItem('ee.apellidos') || '';
    ui.nombre.value = localStorage.getItem('ee.nombre') || '';
  } catch (e) { /* almacenamiento no disponible */ }
  for (const campo of ['apellidos', 'nombre']) {
    ui[campo].addEventListener('input', () => {
      try { localStorage.setItem('ee.' + campo, ui[campo].value); } catch (e) { /* ignorar */ }
      actualizarBotones();
    });
  }

  // ---------- estado ----------
  const estado = { paginas: [], pendiente: null, pdfBlob: null, pdfNombre: '' };

  function mensaje(t) { ui.estado.textContent = t || ''; }

  function nombreSeguro(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function actualizarBotones() {
    const hayNombre = ui.apellidos.value.trim() && ui.nombre.value.trim();
    ui.btnPdf.disabled = !(estado.paginas.length && hayNombre);
    const url = ui.formulario.value.trim();
    ui.btnFormulario.href = url || '#';
    ui.btnFormulario.setAttribute('aria-disabled', url && estado.pdfBlob ? 'false' : 'true');
    ui.nPaginas.textContent = estado.paginas.length;
    ui.siguiente.textContent = estado.paginas.length + 1;
  }
  ui.formulario.addEventListener('input', actualizarBotones);

  // ---------- imágenes ----------
  async function cargarImagen(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('No se puede leer la imagen'));
        img.src = URL.createObjectURL(file);
      });
    }
  }
  function tam(img) { return { w: img.width || img.naturalWidth, h: img.height || img.naturalHeight }; }

  function aCanvas(img, maxLado) {
    const { w, h } = tam(img);
    const esc = Math.min(1, maxLado / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * esc));
    c.height = Math.max(1, Math.round(h * esc));
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function analizar(img) {
    const c = aCanvas(img, LADO_ANALISIS);
    const w = c.width, h = c.height;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let suma = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g[j] = v; suma += v;
    }
    const media = suma / (w * h);
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
        s += l; s2 += l * l; n++;
      }
    }
    const varianza = n ? s2 / n - (s / n) ** 2 : 0;
    const avisos = [];
    if (media < UMBRAL_OSCURA) avisos.push({ tipo: 'oscura', texto: 'La foto está muy oscura. Busca más luz o aparta la sombra del móvil.' });
    if (varianza < UMBRAL_BORROSA) avisos.push({ tipo: 'borrosa', texto: 'La foto parece borrosa. Sujeta el móvil quieto y espera a que enfoque el texto.' });
    const banda = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const claro = (x0, y0, x1, y1) => {
      let cl = 0, t = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (g[y * w + x] > 200) cl++; }
      return t ? cl / t : 0;
    };
    const lados = [];
    if (claro(0, 0, w, banda) > UMBRAL_BORDE) lados.push('arriba');
    if (claro(0, h - banda, w, h) > UMBRAL_BORDE) lados.push('abajo');
    if (claro(0, 0, banda, h) > UMBRAL_BORDE) lados.push('la izquierda');
    if (claro(w - banda, 0, w, h) > UMBRAL_BORDE) lados.push('la derecha');
    if (lados.length) avisos.push({ tipo: 'cortada', texto: 'Puede que la hoja esté cortada por ' + lados.join(', ') + '. Aléjate un poco para que se vea entera con un margen alrededor.' });
    return { avisos, media: Math.round(media), nitidez: Math.round(varianza) };
  }

  async function procesar(file) {
    mensaje('Analizando la foto…');
    try {
      const img = await cargarImagen(file);
      const grande = aCanvas(img, MAX_LADO);
      const mini = aCanvas(img, 200);
      const analisis = analizar(img);
      if (img.close) img.close();
      const pagina = {
        dataUrl: grande.toDataURL('image/jpeg', CALIDAD_JPEG),
        w: grande.width, h: grande.height,
        miniatura: mini.toDataURL('image/jpeg', 0.7),
        avisos: analisis.avisos,
        medida: analisis,
      };
      mensaje('');
      if (pagina.avisos.length) {
        estado.pendiente = pagina;
        ui.avisoImg.src = pagina.dataUrl;
        ui.avisoLista.innerHTML = '';
        for (const a of pagina.avisos) { const li = document.createElement('li'); li.textContent = a.texto; ui.avisoLista.appendChild(li); }
        ui.aviso.hidden = false;
        ui.aviso.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        añadir(pagina);
      }
    } catch (e) {
      mensaje('No se ha podido leer la foto. Prueba otra vez.');
    }
  }

  function añadir(pagina) {
    estado.paginas.push(pagina);
    estado.pdfBlob = null;
    ui.pdfInfo.hidden = true;
    pintarLista();
    actualizarBotones();
    mensaje('Página ' + estado.paginas.length + ' añadida.');
  }

  function pintarLista() {
    ui.lista.innerHTML = '';
    estado.paginas.forEach((p, i) => {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.src = p.miniatura; img.alt = 'Página ' + (i + 1);
      const info = document.createElement('div'); info.className = 'info';
      const b = document.createElement('b'); b.textContent = 'Página ' + (i + 1);
      const s = document.createElement('span');
      if (p.avisos.length) { s.className = 'dudosa'; s.textContent = 'Con avisos: ' + p.avisos.map(a => a.tipo).join(', '); }
      else { s.className = 'ok'; s.textContent = 'Se lee bien'; }
      info.append(b, s);
      const mini = document.createElement('div'); mini.className = 'mini';
      const bRep = document.createElement('button'); bRep.type = 'button'; bRep.textContent = 'Repetir';
      bRep.addEventListener('click', () => { estado.reemplazar = i; ui.inputCamara.click(); });
      const bQuitar = document.createElement('button'); bQuitar.type = 'button'; bQuitar.textContent = 'Quitar';
      bQuitar.addEventListener('click', () => { estado.paginas.splice(i, 1); estado.pdfBlob = null; ui.pdfInfo.hidden = true; pintarLista(); actualizarBotones(); });
      mini.append(bRep, bQuitar);
      li.append(img, info, mini);
      ui.lista.appendChild(li);
    });
  }

  ui.btnFoto.addEventListener('click', () => { estado.reemplazar = null; ui.inputCamara.click(); });
  ui.btnGaleria.addEventListener('click', () => { estado.reemplazar = null; ui.inputGaleria.click(); });
  ui.inputCamara.addEventListener('change', async () => {
    const f = ui.inputCamara.files[0];
    ui.inputCamara.value = '';
    if (!f) return;
    if (estado.reemplazar !== null && estado.reemplazar !== undefined) {
      const idx = estado.reemplazar; estado.reemplazar = null;
      estado.paginas.splice(idx, 1); pintarLista(); actualizarBotones();
    }
    await procesar(f);
  });
  ui.inputGaleria.addEventListener('change', async () => {
    const fs = Array.from(ui.inputGaleria.files);
    ui.inputGaleria.value = '';
    for (const f of fs) await procesar(f);
  });
  ui.btnRepetir.addEventListener('click', () => { estado.pendiente = null; ui.aviso.hidden = true; ui.inputCamara.click(); });
  ui.btnUsar.addEventListener('click', () => { const p = estado.pendiente; estado.pendiente = null; ui.aviso.hidden = true; if (p) añadir(p); });

  // ---------- PDF ----------
  function nombrePdf() {
    const ex = nombreSeguro(ui.examen.value.trim() || 'EXAMEN');
    return ex + '__' + nombreSeguro(ui.apellidos.value.trim()) + '_' + nombreSeguro(ui.nombre.value.trim()) + '.pdf';
  }

  function generarPdf() {
    const { jsPDF } = window.jspdf;
    let doc = null;
    const M = 6;
    estado.paginas.forEach((p) => {
      const orient = p.w > p.h ? 'l' : 'p';
      if (!doc) doc = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4', compress: true });
      else doc.addPage('a4', orient);
      const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
      const r = Math.min((PW - 2 * M) / p.w, (PH - 2 * M) / p.h);
      const w = p.w * r, h = p.h * r;
      doc.addImage(p.dataUrl, 'JPEG', (PW - w) / 2, (PH - h) / 2, w, h, undefined, 'FAST');
    });
    doc.setProperties({
      title: nombrePdf().replace(/\.pdf$/, ''),
      subject: [ui.curso.value, ui.asignatura.value, ui.parcial.value, ui.examen.value].join(' '),
      author: ui.apellidos.value.trim() + ', ' + ui.nombre.value.trim(),
      creator: 'EXAM EASY ' + VERSION,
    });
    return doc.output('blob');
  }

  function descargar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  ui.btnPdf.addEventListener('click', () => {
    if (!window.jspdf) { mensaje('No se ha cargado el generador de PDF. Comprueba la conexión y recarga la página.'); return; }
    mensaje('Generando el PDF…');
    try {
      estado.pdfNombre = nombrePdf();
      estado.pdfBlob = generarPdf();
      descargar(estado.pdfBlob, estado.pdfNombre);
      const kb = Math.round(estado.pdfBlob.size / 1024);
      ui.pdfInfo.textContent = 'Guardado ' + estado.pdfNombre + ' (' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB') + ', ' + estado.paginas.length + ' páginas).';
      ui.pdfInfo.hidden = false;
      mensaje('PDF listo. Ahora abre el formulario y súbelo.');
      if (navigator.canShare && navigator.canShare({ files: [new File([estado.pdfBlob], estado.pdfNombre, { type: 'application/pdf' })] })) {
        ui.btnCompartir.hidden = false;
      }
    } catch (e) {
      mensaje('No se ha podido generar el PDF: ' + (e && e.message ? e.message : e));
    }
    actualizarBotones();
  });

  ui.btnCompartir.addEventListener('click', async () => {
    if (!estado.pdfBlob) return;
    try {
      await navigator.share({ files: [new File([estado.pdfBlob], estado.pdfNombre, { type: 'application/pdf' })], title: estado.pdfNombre });
    } catch (e) { /* el alumno canceló */ }
  });

  ui.btnFormulario.addEventListener('click', (ev) => {
    if (ui.btnFormulario.getAttribute('aria-disabled') === 'true') ev.preventDefault();
  });

  actualizarBotones();
  // para pruebas automáticas: window.examEasy.analizar(imagen) devuelve {avisos, media, nitidez}
  window.examEasy = { version: VERSION, analizar };
})();
