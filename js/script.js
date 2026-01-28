
  const firebaseConfig = {
    apiKey: "AIzaSyD0lj9irvH8deYcd0fsAzmFrDNPJaU34_c",
    authDomain: "lifance-d2316.firebaseapp.com",
    projectId: "lifance-d2316",
    storageBucket: "lifance-d2316.appspot.com",
    messagingSenderId: "87725148350",
    appId: "1:87725148350:web:9d04fc1c247d9058eeb6ef"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();





  let editandoId = null;  // null si es nuevo movimiento, o el ID si es edición
let editandoData = null;  // Para guardar los datos originales temporalmente



  




  

  let usuarioActual = null;
  let tipoSeleccionado = "";
  let misCategorias = { ingreso: [], egreso: [] };
  let misPendientes = [];
  let movimientosCache = [];
  const catDefault = {
    ingreso: ["Salario", "Venta", "Préstamo", "Uti. Mes Ant."],
    egreso: ["Hogar", "Transporte", "Comida", "Salida", "Deuda", "Servicios"]
  };

  auth.onAuthStateChanged(async user => {
    if (user) {
      usuarioActual = user;
      document.getElementById("loginBox").style.display = 'none';
      document.getElementById("appContainer").classList.remove("hidden");
      document.getElementById("bottomNav").classList.remove("hidden");
      actualizarHeaderNombre();
    
      inicializarFiltros("mesFiltro", "anioFiltro");
      inicializarFiltros("mesFiltroStats", "anioFiltroStats");
      inicializarFiltros("mesFiltroPend", "anioFiltroPend");

      await cargarCategoriasDB();
      await cargarPendientesDB();
      cargarMovimientos();
    } else {
      document.getElementById("loginBox").style.display = 'flex';
      document.getElementById("appContainer").classList.add("hidden");
      document.getElementById("bottomNav").classList.add("hidden");
    }
  });

  function login() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  function logout() { auth.signOut(); }

  async function cargarCategoriasDB() {
    if (!usuarioActual) return;
    const snap = await db.collection("categorias").where("uid", "==", usuarioActual.uid).get();
    if (snap.empty) {
        const batch = db.batch();
        ['ingreso', 'egreso'].forEach(t => {
            catDefault[t].forEach((n, idx) => {
                const ref = db.collection("categorias").doc();
                batch.set(ref, { uid: usuarioActual.uid, tipo: t, nombre: n, orden: idx });
            });
        });
        await batch.commit();
        return cargarCategoriasDB();
    }
    misCategorias = { ingreso: [], egreso: [] };
    snap.forEach(doc => {
        const d = doc.data();
        misCategorias[d.tipo].push({ id: doc.id, ...d });
    });
    actualizarListaCategoriasEdit();
    actualizarSelectorCategoriasPendientes();
  }


function escapeForJS(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')   // backslashes primero (importante el orden)
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

  

  function actualizarListaCategoriasEdit() {
    const cont = document.getElementById("listaCategoriasEdit");
    const filtro = document.getElementById("tipoNuevaCat").value;
    if(!cont) return;
    cont.innerHTML = "";
    const lista = misCategorias[filtro].sort((a,b) => (a.orden||0) - (b.orden||0));
    lista.forEach(c => {
        const div = document.createElement("div");
        div.className = "cat-tag";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button onclick="moverCat('${c.id}', -1)" style="padding:0; font-size:10px; background:#eee; width:22px; height:22px;">▲</button>
                    <button onclick="moverCat('${c.id}', 1)" style="padding:0; font-size:10px; background:#eee; width:22px; height:22px;">▼</button>
                </div>
                <span style="text-transform:uppercase; font-weight:600; font-size:0.85rem;">${c.nombre}</span>
            </div>
            <button onclick="borrarCategoria('${c.id}')" style="background:none; color:red; width:auto; margin:0;">✕</button>
        `;
        cont.appendChild(div);
    });
  }

  async function moverCat(id, dir) {
    const todas = [...misCategorias.ingreso, ...misCategorias.egreso];
    const cat = todas.find(c => c.id === id);
    const lista = misCategorias[cat.tipo].sort((a,b) => (a.orden||0) - (b.orden||0));
    const idx = lista.findIndex(c => c.id === id);
    const nuevoIdx = idx + dir;
    if (nuevoIdx < 0 || nuevoIdx >= lista.length) return;
    const batch = db.batch();
    batch.update(db.collection("categorias").doc(lista[idx].id), { orden: nuevoIdx });
    batch.update(db.collection("categorias").doc(lista[nuevoIdx].id), { orden: idx });
    await batch.commit();
    await cargarCategoriasDB();
  }

  async function crearCategoria() {
    const tipo = document.getElementById("tipoNuevaCat").value;
    const nombre = document.getElementById("nombreNuevaCat").value.trim();
    if(!nombre) return;
    await db.collection("categorias").add({ uid: usuarioActual.uid, tipo: tipo, nombre: nombre, orden: misCategorias[tipo].length });
    document.getElementById("nombreNuevaCat").value = "";
    await cargarCategoriasDB();
  }

  async function borrarCategoria(id) {
    if(confirm("¿Borrar categoría?")) { await db.collection("categorias").doc(id).delete(); cargarCategoriasDB(); }
  }

  function actualizarSelectorCategoriasPendientes() {
    const sel = document.getElementById("catPendiente");
    if(!sel) return;
    sel.innerHTML = "";
    misCategorias.egreso.forEach(c => {
        const o = document.createElement("option");
        o.value = c.nombre; o.textContent = c.nombre;
        sel.appendChild(o);
    });
  }

  async function crearPendiente() {
    const monto = Number(document.getElementById("montoPendiente").value.replace(/\D/g, ""));
    const cat = document.getElementById("catPendiente").value;
    const fecha = document.getElementById("fechaPendiente").value;
    const nota = document.getElementById("notaPendiente").value.trim();
    if(!monto || !fecha) return alert("Completa monto y fecha");
    await db.collection("pendientes").add({
        uid: usuarioActual.uid,
        monto, categoria: cat, fecha, nota,
        pagado: false,
        creado: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("montoPendiente").value = "";
    document.getElementById("notaPendiente").value = "";
    alert("Pendiente guardado correctamente.");
    cargarPendientesDB();
  }

  async function cargarPendientesDB() {
    if (!usuarioActual) return;

    const m = parseInt(document.getElementById("mesFiltroPend").value);
    const a = parseInt(document.getElementById("anioFiltroPend").value);

    const primerDia = `${a}-${String(m).padStart(2, '0')}-01`;
    const ultimoDia = `${a}-${String(m).padStart(2, '0')}-${new Date(a, m, 0).getDate()}`;

    const snap = await db.collection("pendientes")
        .where("uid", "==", usuarioActual.uid)
        .where("fecha", ">=", primerDia)
        .where("fecha", "<=", ultimoDia)
        .get();

    misPendientes = [];
    const cont = document.getElementById("listaPendientes");
    if(!cont) return;
    cont.innerHTML = "";
    const formato = new Intl.NumberFormat("es-CO");
    let docs = [];

    snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    docs.sort((a,b) => a.fecha.localeCompare(b.fecha));

    if (docs.length === 0) {
        cont.innerHTML = "<p style='text-align:center; color:#888;'>No hay pendientes para este mes.</p>";
        return;
    }

    docs.forEach(d => {
        misPendientes.push(d);
        const item = document.createElement("div");
        item.className = `pago-item ${d.pagado ? 'pagado' : ''}`;
        item.innerHTML = `
            <div>
                <span style="font-weight:bold;">${d.pagado ? '✅ ' : '⏳ '}${d.categoria}</span><br>
                <small>${d.fecha} - ${d.nota || 'Sin nota'}</small>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:bold; color:var(--egreso);">$ ${formato.format(d.monto)}</div>
                <button onclick="borrarPendiente('${d.id}')" style="background:none; color:red; padding:0; width:auto; margin:0; font-size:11px;">Eliminar ✕</button>
            </div>
        `;
        cont.appendChild(item);
    });

  }

  async function borrarPendiente(id) {
      if(confirm("¿Eliminar este pendiente?")) {
          await db.collection("pendientes").doc(id).delete();
          cargarPendientesDB();
      }
  }


async function obtenerTodosLosPendientesPorPagar() {
    if (!usuarioActual) return [];
    const snap = await db.collection("pendientes")
        .where("uid", "==", usuarioActual.uid)
        .where("pagado", "==", false)
        .get();

    let todos = [];
    snap.forEach(doc => {
        const data = doc.data();
        // Extraemos mes y año de la fecha "YYYY-MM-DD"
        const partes = data.fecha.split("-");
        const fechaLegible = `${partes[1]}/${partes[0]}`; // Formato MM/YYYY
        todos.push({ id: doc.id, ...data, fechaLegible });
    });
    return todos;
}

async function detectarPendientes() {
    const cat = document.getElementById("categoria").value;
    const selContainer = document.getElementById("selectorPendienteContainer");
    const selVinculo = document.getElementById("pendienteVinculo");

    if (tipoSeleccionado !== 'egreso') {
        selContainer.classList.add("hidden");
        return;
    }

    // Buscamos en TODOS los pendientes por pagar de la DB, no solo los del cache local
    const todosPendientes = await obtenerTodosLosPendientesPorPagar();
    const pendientesCat = todosPendientes.filter(p => p.categoria === cat);

    if (pendientesCat.length > 0) {
        selVinculo.innerHTML = '<option value="">-- OTRO (Gasto normal) --</option>';

        pendientesCat.forEach(p => {
            const o = document.createElement("option");
            o.value = p.id;
            // Aquí incluimos el Mes/Año al lado del texto
            const montoFormateado = new Intl.NumberFormat("es-CO").format(p.monto);
            o.textContent = `[${p.fechaLegible}] PAGAR: $${montoFormateado} (${p.nota || 'Sin nota'})`;
            selVinculo.appendChild(o);
        });
        selContainer.classList.remove("hidden");
    } else {
        selContainer.classList.add("hidden");
    }
}

function aplicarDatosPendiente() {
    const id = document.getElementById("pendienteVinculo").value;
    if (!id) return;
    const p = misPendientes.find(x => x.id === id);
    if (p) {
        document.getElementById("monto").value = "$ " + new Intl.NumberFormat("es-CO").format(p.monto);
        document.getElementById("nota").value = p.nota;
    }
}

// --- Lógica Movimientos ---
function seleccionarMetodo(m) {
    document.getElementById("metodoPago").value = m;
    document.getElementById("optCash").classList.toggle("active", m === 'CASH');
    document.getElementById("optBank").classList.toggle("active", m === 'BANK');
}

function setTipo(t) {
    tipoSeleccionado = t;
    document.getElementById("btnIngreso").style.opacity = t === 'ingreso' ? '1' : '0.4';
    document.getElementById("btnEgreso").style.opacity = t === 'egreso' ? '1' : '0.4';
    const catS = document.getElementById("categoria");
    catS.innerHTML = "";
    const lista = misCategorias[t].sort((a,b) => (a.orden||0) - (b.orden||0));
    lista.forEach(c => { const o = document.createElement("option"); o.value = o.textContent = c.nombre; catS.appendChild(o); });
    catS.classList.remove("hidden");
    document.getElementById("metodoPagoContainer").classList.remove("hidden");
    document.getElementById("nota").classList.remove("hidden");
    document.getElementById("btnGuardar").classList.remove("hidden");
    detectarPendientes();
}

async function guardarMovimiento() {
    const btnGuardar = document.getElementById("btnGuardar");
    const mI = document.getElementById("monto");
    const val = Number(mI.value.replace(/\D/g, ""));
    const fec = document.getElementById("fecha").value;
    const pendienteId = document.getElementById("pendienteVinculo").value;

    if (!val || !tipoSeleccionado) return alert("Faltan datos");

    // --- EFECTO DE CARGA ---
    // Deshabilitamos el botón y cambiamos el texto
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = "⌛ Registrando...";
    btnGuardar.style.opacity = "0.7";
    btnGuardar.style.cursor = "not-allowed";

    try {
        const ahora = new Date();
        const horaString = ahora.getHours().toString().padStart(2, '0') + ":" + ahora.getMinutes().toString().padStart(2, '0');

        const batch = db.batch();
        const movRef = db.collection("movimientos").doc();

        batch.set(movRef, {
            uid: usuarioActual.uid,
            tipo: tipoSeleccionado,
            categoria: document.getElementById("categoria").value,
            monto: val,
            fecha: fec,
            hora: horaString,
            metodo: document.getElementById("metodoPago").value,
            nota: document.getElementById("nota").value.trim(),
            pendienteVinculado: pendienteId || null,
            creado: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (pendienteId) {
            batch.update(db.collection("pendientes").doc(pendienteId), { pagado: true });
        }

        await batch.commit();

        // Limpieza de campos tras éxito
        mI.value = "";
        document.getElementById("nota").value = "";
        document.getElementById("selectorPendienteContainer").classList.add("hidden");

        await cargarPendientesDB();
        cargarMovimientos();

        // Opcional: Pequeña alerta visual de éxito
        console.log("Movimiento registrado con éxito");

    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al registrar. Inténtalo de nuevo.");
    } finally {
        // --- RESTAURAR BOTÓN ---
        // Volvemos el botón a su estado original pase lo que pase
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = "Registrar Movimiento";
        btnGuardar.style.opacity = "1";
        btnGuardar.style.cursor = "pointer";
    }
}



function cargarMovimientos() {
    const m = parseInt(document.getElementById("mesFiltro").value);
    const a = parseInt(document.getElementById("anioFiltro").value);
    const pD = `${a}-${String(m).padStart(2, '0')}-01`;
    const uD = `${a}-${String(m).padStart(2, '0')}-${new Date(a, m, 0).getDate()}`;

    db.collection("movimientos")
        .where("uid", "==", usuarioActual.uid)
        .where("fecha", ">=", pD)
        .where("fecha", "<=", uD)
        .get()
        .then(snap => {
            movimientosCache = [];
            snap.forEach(doc => {
                movimientosCache.push({ id: doc.id, ...doc.data() });
            });

            // Ordenamiento: cronológico descendente (más reciente arriba)
            movimientosCache.sort((a, b) => {
                // 1. Fecha descendente (principal)
                if (a.fecha !== b.fecha) {
                    return b.fecha.localeCompare(a.fecha);
                }

                // 2. Hora descendente
                const horaA = a.hora || "00:00";
                const horaB = b.hora || "00:00";
                if (horaA !== horaB) {
                    return horaB.localeCompare(horaA);
                }

                // 3. Desempate: creado descendente (el más nuevo primero)
                if (b.creado && a.creado) {
                    const diff = b.creado.seconds - a.creado.seconds;
                    if (diff !== 0) return diff;
                    return b.creado.nanoseconds - a.creado.nanoseconds;
                }

                return 0;
            });

            renderizarLista(movimientosCache);
        })
        .catch(err => {
            console.error("Error al cargar movimientos:", err);
        });
}



  

    function renderizarLista(datos) {
        const listaCont = document.getElementById("listaMovimientos");
        if (!listaCont) return;
        listaCont.innerHTML = "";
    
        let iT = 0, eT = 0, cashTotal = 0, bankTotal = 0, tcTotal = 0;
    
        datos.forEach(d => {
            // Lógica de saldos
            if (d.tipo === "ingreso") {
                iT += d.monto;
                if (d.metodo === 'CASH') cashTotal += d.monto;
                else if (d.metodo === 'BANK') bankTotal += d.monto;
                // Nota: si algún día permites ingresos con TC, agrégalo aquí
            } 
            else if (d.tipo === "egreso") {
                if (d.metodo !== 'TC') {
                    eT += d.monto;
                    if (d.metodo === 'CASH') cashTotal -= d.monto;
                    else if (d.metodo === 'BANK') bankTotal -= d.monto;
                } else {
                    // Egreso con TC → aumenta la deuda
                    tcTotal += d.monto;
                    // NO afecta eT ni cash/bank
                }
            } 
            else if (d.tipo === "transferencia") {
                if (d.metodo === 'CASH') cashTotal += d.monto;
                else if (d.metodo === 'BANK') bankTotal += d.monto;
                // Si algún día hay transferencias desde/hacia TC, agrégalo aquí
            }
    
            // Renderizado de la tarjeta (con icono y clase para TC)
            const wrapper = document.createElement("div");
            wrapper.className = "movimiento-wrapper";
    
            let iconoMetodo = '💵';
            if (d.metodo === 'BANK') iconoMetodo = '📲';
            if (d.metodo === 'TC') iconoMetodo = '💳';
    
            wrapper.innerHTML = `
                    <div class="card ${d.tipo}-item ${d.metodo === 'TC' ? 'tc-item' : ''}" onclick="toggleComent('${d.id}')">
                        <div class="card-top">
                            <div class="card-info">
                                <div class="card-cat">
                                    ${d.categoria}
                                    ${d.pendienteVinculado ? '<span class="badge-pend">PAGADO</span>' : ''}
                                    <span style="margin-left: 6px; font-size: 1rem;" title="${d.metodo}">${iconoMetodo}</span>
                                </div>
                                <div class="card-date">${d.fecha} <span style="margin-left:5px; color:#aaa;">${d.hora || ''}</span></div>
                            </div>
                            <div class="card-monto text-${d.tipo}">
                                $ ${new Intl.NumberFormat("es-CO").format(Math.abs(d.monto))}
                            </div>
                            <div onclick="toggleSwipe(this, event)" style="color: #ccc; font-size: 1.2rem; margin-left: 10px; cursor: pointer; padding: 10px;">❮</div>
                        </div>
                        <div id="c-${d.id}" class="comentario-box">📝 ${d.nota || 'Sin nota'}</div>
                    </div>
            
                    <div class="card-swipe-actions">
                        <!-- Aquí va el botón de editar con escapeForJS -->
                        <button class="btn-swipe btn-edit" onclick="openAddModal(true, {tipo: '${d.tipo}', categoria: '${escapeForJS(d.categoria)}', monto: ${Math.abs(d.monto)}, fecha: '${d.fecha}', nota: '${escapeForJS(d.nota)}', metodo: '${d.metodo}', pendienteVinculado: '${d.pendienteVinculado || ''}'}, '${d.id}')">✏️</button>
                        
                        <button class="btn-swipe btn-delete" onclick="borrarMov('${d.id}')">✕</button>
                    </div>
                `;
            listaCont.appendChild(wrapper);
        });
    
        // Mantenemos la llamada original → los -stats se actualizan sin romperse
        actualizarResumenVisual(iT, eT, cashTotal, bankTotal, tcTotal);
    }

function filtrarMovimientos() {
    const term = document.getElementById("buscador").value.toLowerCase();
    const filtrados = movimientosCache.filter(m => m.categoria.toLowerCase().includes(term) || (m.nota && m.nota.toLowerCase().includes(term)));
    renderizarLista(filtrados);
}

function actualizarResumenVisual(iT, eT, cashTotal, bankTotal, tcTotal = 0) {
    const formato = new Intl.NumberFormat("es-CO");
    const balance = iT - eT;           // o cashTotal + bankTotal, según prefieras
    // Nota: si quieres que disponible sea solo cash+bank (sin considerar TC como deuda),
    // usa: const balance = cashTotal + bankTotal;

    // Principales
    document.getElementById("totalIngresos").textContent = "$ " + formato.format(iT);
    document.getElementById("totalEgresos").textContent = "$ " + formato.format(eT);

    const disp = document.getElementById("disponible");
    disp.textContent = "$ " + formato.format(balance);
    disp.style.color = balance < 0 ? "#e74c3c" : "white";

    // Stats (se mantienen intactos)
    if (document.getElementById("totalIngresos-stats")) {
        document.getElementById("totalIngresos-stats").textContent = "$ " + formato.format(iT);
        document.getElementById("totalEgresos-stats").textContent = "$ " + formato.format(eT);
        document.getElementById("disponible-stats").textContent = "$ " + formato.format(balance);
        // Opcional: color en stats también
        document.getElementById("disponible-stats").style.color = balance < 0 ? "#e74c3c" : "white";
    }

    // Saldos detallados del popover
    const cashEl = document.getElementById("saldo-cash");
    const bankEl = document.getElementById("saldo-bank");
    const tcEl   = document.getElementById("saldo-tc");

    if (cashEl) {
        cashEl.textContent = "$ " + formato.format(cashTotal);
        cashEl.style.color = cashTotal < 0 ? "#c0392b" : "#2c3e50";
    }
    if (bankEl) {
        bankEl.textContent = "$ " + formato.format(bankTotal);
        bankEl.style.color = bankTotal < 0 ? "#c0392b" : "#2c3e50";
    }
    if (tcEl) {
        tcEl.textContent = "$ " + formato.format(tcTotal);
        tcEl.style.color = tcTotal > 0 ? "#e74c3c" : "#2c3e50";  // rojo si hay deuda positiva
    }
}

// --- UI y Navegación ---
function cambiarVista(v) {
    if (v === 'add') {
        openAddModal();
        return;
    }
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${v}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Mapeo de índices para el menú de 5 opciones
    const vistas = ['stats', 'home', 'add', 'pendientes', 'settings'];
    const idx = vistas.indexOf(v);
    if (idx >= 0 && idx < 5) {
        document.querySelectorAll('.nav-item')[idx].classList.add('active');
    }

    // Actualizar iconos: solid para activo, outline para inactivos
    document.querySelectorAll('.nav-item i').forEach((icon, i) => {
        const isActive = i === idx;
        if (i === 0) { // Resumen
            icon.className = isActive ? 'fas fa-chart-bar' : 'far fa-chart-bar';
        } else if (i === 1) { // Movimientos
            icon.className = isActive ? 'fas fa-list' : 'far fa-list';
        } else if (i === 2) { // + (floating, always solid)
            icon.className = 'fas fa-plus';
        } else if (i === 3) { // Pendientes
            icon.className = isActive ? 'fas fa-clock' : 'far fa-clock';
        } else if (i === 4) { // Perfil
            icon.className = isActive ? 'fas fa-user' : 'far fa-user';
        }
    });

    if(v === 'stats') cargarEstadisticas();
    if(v === 'pendientes') cargarPendientesDB();
    window.scrollTo(0,0);
}

function abrirModalMovimiento() {
    // Mostrar el formulario de nuevo movimiento y cambiar a la vista home
    cambiarVista('home');
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleModalTransf() {
    document.getElementById("modalTransferencia").classList.toggle("hidden");
    document.getElementById("balance-popover").classList.add("hidden");
    document.getElementById("montoTransf").value = "";
}

function actualizarDestinoTransf() {
    const o = document.getElementById("transfOrigen").value;
    document.getElementById("transfDestino").value = (o === 'CASH') ? '🏛️ BANK' : '💵 CASH';
}

async function ejecutarTransferencia() {
    const mStr = document.getElementById("montoTransf").value;
    const val = Number(mStr.replace(/\D/g, ""));
    if (!val || val <= 0) return alert("Monto inválido");
    const origen = document.getElementById("transfOrigen").value;
    const destino = (origen === 'CASH') ? 'BANK' : 'CASH';
    const fecha = new Date().toLocaleDateString('en-CA');
    const ahora = new Date();
    const hora = ahora.getHours().toString().padStart(2, '0') + ":" + ahora.getMinutes().toString().padStart(2, '0');
    try {
        const batch = db.batch();
        const refE = db.collection("movimientos").doc();
        batch.set(refE, { uid: usuarioActual.uid, tipo: "transferencia", categoria: "Transferencia (Salida)", monto: -val, fecha, hora, metodo: origen, nota: `Hacia ${destino}`, creado: firebase.firestore.FieldValue.serverTimestamp() });
        const refI = db.collection("movimientos").doc();
        batch.set(refI, { uid: usuarioActual.uid, tipo: "transferencia", categoria: "Transferencia (Entrada)", monto: val, fecha, hora, metodo: destino, nota: `Desde ${origen}`, creado: firebase.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        toggleModalTransf();
        cargarMovimientos();
    } catch (e) { alert("Error al transferir"); }
}

function toggleBalancePopover() { document.getElementById("balance-popover").classList.toggle("hidden"); }

function prepararEdicion(id, data) {
    document.getElementById("formTitle").textContent = "Editando Movimiento";
    document.getElementById("monto").value = Math.abs(data.monto);
    formatearMonto(document.getElementById("monto"));
    document.getElementById("fecha").value = data.fecha;
    document.getElementById("nota").value = data.nota || "";
    setTipo(data.tipo);
    document.getElementById("categoria").value = data.categoria;
    seleccionarMetodo(data.metodo);
    const btn = document.getElementById("btnGuardar");
    btn.textContent = "Guardar Cambios";
    btn.onclick = () => actualizarMovimiento(id);
    document.getElementById("btnCancelarEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function actualizarMovimiento(id) {
    const val = Number(document.getElementById("monto").value.replace(/\D/g, ""));
    const data = { monto: val, fecha: document.getElementById("fecha").value, categoria: document.getElementById("categoria").value, metodo: document.getElementById("metodoPago").value, nota: document.getElementById("nota").value.trim() };
    await db.collection("movimientos").doc(id).update(data);
    cancelarEdicion();
    cargarMovimientos();
}

function cancelarEdicion() {
    document.getElementById("formTitle").textContent = "Nuevo Movimiento";
    document.getElementById("monto").value = "";
    document.getElementById("nota").value = "";
    document.getElementById("btnCancelarEdit").classList.add("hidden");
    const btn = document.getElementById("btnGuardar");
    btn.textContent = "Registrar Movimiento";
    btn.onclick = guardarMovimiento;
}

function cargarEstadisticas() {
    const m = parseInt(document.getElementById("mesFiltroStats").value);
    const a = parseInt(document.getElementById("anioFiltroStats").value);
    const pD = `${a}-${String(m).padStart(2, '0')}-01`;
    const uD = `${a}-${String(m).padStart(2, '0')}-${new Date(a, m, 0).getDate()}`;

    // Mostrar indicador de carga (opcional, pero mejora UX)
    document.getElementById("statsContent").innerHTML = '<p style="text-align:center; color:#888;">Cargando estadísticas...</p>';

    db.collection("movimientos")
        .where("uid", "==", usuarioActual.uid)
        .where("fecha", ">=", pD)
        .where("fecha", "<=", uD)
        .get()
        .then(snap => {
            let sI = {}, sE = {}, sTC = {};
            let tI = 0, tE = 0, tTC = 0;

            snap.forEach(doc => {
                const d = doc.data();
                if (d.tipo === 'ingreso') {
                    sI[d.categoria] = (sI[d.categoria] || 0) + d.monto;
                    tI += d.monto;
                } else if (d.tipo === 'egreso') {
                    sE[d.categoria] = (sE[d.categoria] || 0) + d.monto;
                    tE += d.monto;
                    if (d.metodo === 'TC') {
                        sTC[d.categoria] = (sTC[d.categoria] || 0) + d.monto;
                        tTC += d.monto;
                    }
                }
            });

            let html = '';

            // Ingresos
            html += `<div class="stat-header text-ingreso" style="background:#f1f1f1; padding:10px; font-weight:bold; margin-top:15px;">INGRESOS ($ ${new Intl.NumberFormat("es-CO").format(tI)})</div>`;
            for (let [c, v] of Object.entries(sI)) {
                html += `<div class="row" style="justify-content:space-between; padding:8px; border-bottom:1px solid #eee;"><span>${c}</span><span class="text-ingreso">$ ${new Intl.NumberFormat("es-CO").format(v)}</span></div>`;
            }

            // Egresos normales
            html += `<div class="stat-header text-egreso" style="background:#f1f1f1; padding:10px; font-weight:bold; margin-top:20px;">EGRESOS ($ ${new Intl.NumberFormat("es-CO").format(tE)})</div>`;
            for (let [c, v] of Object.entries(sE)) {
                html += `<div class="row" style="justify-content:space-between; padding:8px; border-bottom:1px solid #eee;"><span>${c}</span><span class="text-egreso">$ ${new Intl.NumberFormat("es-CO").format(v)}</span></div>`;
            }

            // Egresos con TC
            if (tTC > 0) {
                html += `<div class="stat-header text-tc" style="background:#f1f1f1; padding:10px; font-weight:bold; margin-top:25px; color: #e67e22;">
                    EGRESOS CON TARJETA DE CRÉDITO ($ ${new Intl.NumberFormat("es-CO").format(tTC)})</div>`;
                for (let [c, v] of Object.entries(sTC)) {
                    html += `<div class="row" style="justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
                        <span>${c}</span>
                        <span style="color:#e67e22;">$ ${new Intl.NumberFormat("es-CO").format(v)}</span>
                    </div>`;
                }
            } else {
                html += `<p style="text-align:center; color:#888; margin-top:20px;">No hay egresos con TC este mes</p>`;
            }

            // Insertar todo de una vez al final
            document.getElementById("statsContent").innerHTML = html;
        })
        .catch(err => {
            console.error("Error cargando estadísticas:", err);
            document.getElementById("statsContent").innerHTML = '<p style="color:red; text-align:center;">Error al cargar estadísticas</p>';
        });
}

function actualizarHeaderNombre() {
    const n = usuarioActual.displayName || usuarioActual.email;
    document.getElementById("headerTitle").textContent = `Lifance de ${n.split(' ')[0]}`;
    document.getElementById("userSubtitle").textContent = usuarioActual.email;
}

function inicializarFechas() { document.getElementById("fecha").value = new Date().toLocaleDateString('en-CA'); }
function inicializarFiltros(idM, idA) {
    const hoy = new Date();
    const sM = document.getElementById(idM);
    const sA = document.getElementById(idA);
    if(!sM || !sA) return;
    sM.innerHTML = ""; sA.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      let o = document.createElement("option");
      o.value = m + 1;
      o.textContent = new Date(2000, m, 1).toLocaleString("es", { month: "long" });
      if (m === hoy.getMonth()) o.selected = true; sM.appendChild(o);
    }
    for (let a = hoy.getFullYear() - 1; a <= hoy.getFullYear() + 1; a++) {
      let o = document.createElement("option");
      o.value = a; o.textContent = a;
      if (a === hoy.getFullYear()) o.selected = true; sA.appendChild(o);
    }
}

function formatearMonto(i) {
    let v = i.value.replace(/\D/g, "");
    i.value = v ? "$ " + new Intl.NumberFormat("es-CO").format(v) : "";
}

function toggleComent(id) { const c = document.getElementById(`c-${id}`); if(c) c.style.display = c.style.display === "block" ? "none" : "block"; }
function borrarMov(id) { if(confirm("¿Borrar movimiento?")) db.collection("movimientos").doc(id).delete().then(()=>cargarMovimientos()); }
function actualizarPerfil() {
    const n = document.getElementById("inputNombreUsuario").value;
    if(n) usuarioActual.updateProfile({ displayName: n }).then(() => { alert("Perfil actualizado"); actualizarHeaderNombre(); });
}

function toggleSwipe(el, event) {
    // Evitamos que el clic abra también el comentario de la tarjeta
    event.stopPropagation();

    // Buscamos el contenedor que tiene el scroll (movimiento-wrapper)
    const wrapper = el.closest('.movimiento-wrapper');

    // Si el scroll está al inicio, lo movemos al final (donde están los botones)
    if (wrapper.scrollLeft < 50) {
        wrapper.scrollTo({
            left: wrapper.scrollWidth,
            behavior: 'smooth'
        });
        el.textContent = '❯'; // Cambia la flecha para indicar cierre
    } else {
        wrapper.scrollTo({
            left: 0,
            behavior: 'smooth'
        });
        el.textContent = '❮'; // Cambia la flecha para indicar apertura
    }
}

// --- Modal Functions ---
function openAddModal(esEdicion = false, data = null, id = null) {
    editandoId = esEdicion ? id : null;
    editandoData = data;

    const modal = document.getElementById("modalAddMovimiento");
    const title = modal.querySelector("h3");  // El h3 dentro del modal
    const btnGuardar = document.getElementById("btnGuardarModal");

    if (esEdicion) {
        title.textContent = "Editar Movimiento";
        btnGuardar.textContent = "Guardar Cambios";
        btnGuardar.onclick = guardarMovimientoModal;  // Asegura que use la función correcta

        // Cargar datos en el form del modal
        document.getElementById("montoModal").value = "$ " + new Intl.NumberFormat("es-CO").format(Math.abs(data.monto));
        document.getElementById("fechaModal").value = data.fecha;
        document.getElementById("notaModal").value = data.nota || "";

        // Setear tipo (ingreso/egreso)
        setTipoModal(data.tipo);

        // Categoría (después de setTipoModal, porque cambia el select)
        document.getElementById("categoriaModal").value = data.categoria;

        // Método de pago
        seleccionarMetodoModal(data.metodo);

        // Mostrar secciones ocultas (ya que en edición ya hay tipo)
        document.getElementById("categoriaModal").classList.remove("hidden");
        document.getElementById("metodoPagoContainerModal").classList.remove("hidden");
        document.getElementById("notaModal").classList.remove("hidden");
        document.getElementById("btnGuardarModal").classList.remove("hidden");

        // Detectar pendientes si es egreso
        detectarPendientesModal();

        // Si hay pendiente vinculado, precargarlo (opcional, pero útil)
        if (data.pendienteVinculado) {
            document.getElementById("pendienteVinculoModal").value = data.pendienteVinculado;
        }
    } else {
        // Modo nuevo (lo que ya tenías)
        title.textContent = "Nuevo Movimiento";
        btnGuardar.textContent = "Registrar Movimiento";
        btnGuardar.onclick = guardarMovimientoModal;

        // Resetear form
        document.getElementById("montoModal").value = "";
        document.getElementById("fechaModal").value = new Date().toLocaleDateString('en-CA');
        document.getElementById("notaModal").value = "";
        document.getElementById("categoriaModal").classList.add("hidden");
        document.getElementById("selectorPendienteContainerModal").classList.add("hidden");
        document.getElementById("metodoPagoContainerModal").classList.add("hidden");
        document.getElementById("btnGuardarModal").classList.add("hidden");
        document.getElementById("btnIngresoModal").style.opacity = "1";
        document.getElementById("btnEgresoModal").style.opacity = "1";
        tipoSeleccionadoModal = "";
    }

    modal.classList.remove("hidden");
}

function closeAddModal() {
    document.getElementById("modalAddMovimiento").classList.add("hidden");
    // Reset modal form
    document.getElementById("montoModal").value = "";
    document.getElementById("notaModal").value = "";
    document.getElementById("categoriaModal").classList.add("hidden");
    document.getElementById("selectorPendienteContainerModal").classList.add("hidden");
    document.getElementById("metodoPagoContainerModal").classList.add("hidden");
    document.getElementById("btnGuardarModal").classList.add("hidden");
    document.getElementById("btnIngresoModal").style.opacity = "1";
    document.getElementById("btnEgresoModal").style.opacity = "1";
    editandoId = null; editandoData = null;
}

function inicializarFechasModal() {
    document.getElementById("fechaModal").value = new Date().toLocaleDateString('en-CA');
}

let tipoSeleccionadoModal = "";

function setTipoModal(t) {
    tipoSeleccionadoModal = t;
    document.getElementById("btnIngresoModal").style.opacity = t === 'ingreso' ? '1' : '0.4';
    document.getElementById("btnEgresoModal").style.opacity = t === 'egreso' ? '1' : '0.4';
    
    // --- NUEVA LÓGICA: Ocultar TC si es Ingreso ---
    const optTC = document.getElementById("optTCModal");
    if (t === 'ingreso') {
        optTC.classList.add("hidden");
        // Si estaba seleccionado TC, volvemos a CASH por defecto
        if (document.getElementById("metodoPagoModal").value === 'TC') {
            seleccionarMetodoModal('CASH');
        }
    } else {
        optTC.classList.remove("hidden");
    }

    const catS = document.getElementById("categoriaModal");
    catS.innerHTML = "";
    const lista = misCategorias[t].sort((a,b) => (a.orden||0) - (b.orden||0));
    lista.forEach(c => { const o = document.createElement("option"); o.value = o.textContent = c.nombre; catS.appendChild(o); });
    catS.classList.remove("hidden");
    document.getElementById("metodoPagoContainerModal").classList.remove("hidden");
    document.getElementById("notaModal").classList.remove("hidden");
    document.getElementById("btnGuardarModal").classList.remove("hidden");
    detectarPendientesModal();
}

function seleccionarMetodoModal(m) {
    document.getElementById("metodoPagoModal").value = m;
    document.getElementById("optCashModal").classList.toggle("active", m === 'CASH');
    document.getElementById("optBankModal").classList.toggle("active", m === 'BANK');
    document.getElementById("optTCModal").classList.toggle("active", m === 'TC');
}

async function detectarPendientesModal() {
    const cat = document.getElementById("categoriaModal").value;
    const selContainer = document.getElementById("selectorPendienteContainerModal");
    const selVinculo = document.getElementById("pendienteVinculoModal");

    if (tipoSeleccionadoModal !== 'egreso') {
        selContainer.classList.add("hidden");
        return;
    }

    const todosPendientes = await obtenerTodosLosPendientesPorPagar();
    const pendientesCat = todosPendientes.filter(p => p.categoria === cat);

    if (pendientesCat.length > 0) {
        selVinculo.innerHTML = '<option value="">-- OTRO (Gasto normal) --</option>';
        pendientesCat.forEach(p => {
            const o = document.createElement("option");
            o.value = p.id;
            const montoFormateado = new Intl.NumberFormat("es-CO").format(p.monto);
            o.textContent = `[${p.fechaLegible}] PAGAR: $${montoFormateado} (${p.nota || 'Sin nota'})`;
            selVinculo.appendChild(o);
        });
        selContainer.classList.remove("hidden");
    } else {
        selContainer.classList.add("hidden");
    }
}

function aplicarDatosPendienteModal() {
    const id = document.getElementById("pendienteVinculoModal").value;
    if (!id) return;
    const p = misPendientes.find(x => x.id === id);
    if (p) {
        document.getElementById("montoModal").value = "$ " + new Intl.NumberFormat("es-CO").format(p.monto);
        document.getElementById("notaModal").value = p.nota;
    }
}


    async function guardarMovimientoModal() {
        const btnGuardar = document.getElementById("btnGuardarModal");
        const mI = document.getElementById("montoModal");
        const val = Number(mI.value.replace(/\D/g, ""));
        const fec = document.getElementById("fechaModal").value;
        const pendienteId = document.getElementById("pendienteVinculoModal").value;
    
        if (!val || !tipoSeleccionadoModal) return alert("Faltan datos");
    
        // Efecto de carga
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = "⌛ Guardando...";
        btnGuardar.style.opacity = "0.7";
        btnGuardar.style.cursor = "not-allowed";
    
        try {
            const datos = {
                uid: usuarioActual.uid,
                tipo: tipoSeleccionadoModal,
                categoria: document.getElementById("categoriaModal").value,
                monto: val,
                fecha: fec,
                metodo: document.getElementById("metodoPagoModal").value,
                nota: document.getElementById("notaModal").value.trim(),
                pendienteVinculado: pendienteId || null
            };
    
            const batch = db.batch();
            const movRef = db.collection("movimientos").doc(editandoId || undefined);
    
            if (editandoId) {
                // EDICIÓN: 
                // NO incluimos la 'hora' en el objeto 'datos' para que Firebase no la sobrescriba.
                // Así se mantiene la hora original del movimiento.
                batch.update(movRef, datos);
            } else {
                // NUEVO MOVIMIENTO:
                // Aquí sí generamos la hora actual y el timestamp de creación.
                const ahora = new Date();
                datos.hora = ahora.getHours().toString().padStart(2, '0') + ":" + ahora.getMinutes().toString().padStart(2, '0');
                datos.creado = firebase.firestore.FieldValue.serverTimestamp();
                batch.set(movRef, datos);
            }
    
            // Si es nuevo y vincula pendiente, marcar pagado
            if (pendienteId && !editandoId) {
                batch.update(db.collection("pendientes").doc(pendienteId), { pagado: true });
            }
    
            await batch.commit();
    
            // Limpieza y recarga
            closeAddModal();
            await cargarPendientesDB();
            cargarMovimientos();
    
            console.log("Movimiento guardado/editado con éxito");
    
        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Hubo un error al registrar. Inténtalo de nuevo.");
        } finally {
            // Restaurar botón
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = editandoId ? "Guardar Cambios" : "Registrar Movimiento";
            btnGuardar.style.opacity = "1";
            btnGuardar.style.cursor = "pointer";
        }
    }

      function toggleDarkMode() {
          const isDark = document.body.classList.toggle('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
      }
      
      function initDarkMode() {
          const darkMode = localStorage.getItem('darkMode');
          if (darkMode === 'enabled') {
              document.body.classList.add('dark-mode');
              const toggle = document.getElementById('darkModeToggle');
              if (toggle) toggle.checked = true;
          }
      }
      
      // Llama a initDarkMode() dentro de auth.onAuthStateChanged
      auth.onAuthStateChanged(async user => {
          initDarkMode();
          // ... tu código existente ...
      });


// Función mejorada para cerrar modales al hacer clic/tocar fuera (PC y Móvil)
function configurarCierreModales() {
    const overlays = document.querySelectorAll('.modal-overlay');
    const popoverBalance = document.getElementById("balance-popover");

    // Manejar clics en los overlays de los modales
    overlays.forEach(overlay => {
        // Usamos 'mousedown' o 'click' para mayor compatibilidad en móviles
        overlay.addEventListener('click', function(event) {
            // Verificamos que el clic sea exactamente en el fondo (overlay) y no en el contenido
            if (event.target === this) {
                if (this.id === "modalAddMovimiento") {
                    closeAddModal();
                } else if (this.id === "modalTransferencia") {
                    toggleModalTransf();
                }
            }
        });
    });

    // Manejar clics fuera del popover de balance
    document.addEventListener('click', function(event) {
        if (popoverBalance && !popoverBalance.classList.contains("hidden")) {
            const btnBalance = event.target.closest('button');
            // Si el clic no es dentro del popover y no es el botón de la moneda
            if (!popoverBalance.contains(event.target) && (!btnBalance || !btnBalance.innerText.includes("💰"))) {
                popoverBalance.classList.add("hidden");
            }
        }
    });
}

// Ejecutar la configuración al cargar la página
configurarCierreModales();

  
