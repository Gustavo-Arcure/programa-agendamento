const agendaDate = document.getElementById("agendaDate");
let configDia = { open: "08:00", close: "20:00", blockedTimes: [], isDayClosed: false };

// --- FUNÇÕES DE AGENDA E HORÁRIOS ---

async function carregarTudo() {
    const date = agendaDate.value;
    const r = await fetch(`/api/admin/get-schedule?date=${date}`);
    configDia = await r.json();
    
    const btnFechar = document.getElementById("btnFechar");
    if (btnFechar) {
        btnFechar.innerText = configDia.isDayClosed ? "🔓 Abrir barbearia" : "🚫 Fechar barbearia";
    }
    
    renderizarGrade();
    listarAgendados(date);
    carregarServicosAdmin(); // Garante que os serviços carreguem junto
}

function renderizarGrade() {
    const container = document.getElementById("gradeHorarios");
    if (!container) return;
    
    container.innerHTML = "";
    if(configDia.isDayClosed) {
        container.innerHTML = "<p style='grid-column: 1/-1; text-align: center; padding: 20px;'>🚫 Barbearia Fechada neste dia</p>";
        return;
    }

    const openTime = configDia.open || "08:00";
    const closeTime = configDia.close || "20:00";
    const selectedDate = agendaDate.value;

    try {
        let curr = new Date(`${selectedDate}T${openTime}:00`);
        let end = new Date(`${selectedDate}T${closeTime}:00`);

        if (isNaN(curr.getTime())) return;

        while(curr <= end) {
            const h = curr.toTimeString().substring(0, 5);
            const div = document.createElement("div");
            div.innerText = h;
            
            // Classe 'selected' para horários bloqueados (vermelho)
            div.className = "slot" + (configDia.blockedTimes && configDia.blockedTimes.includes(h) ? " selected" : "");
            
            div.onclick = async () => {
                if(!configDia.blockedTimes) configDia.blockedTimes = [];
                if(configDia.blockedTimes.includes(h)) {
                    configDia.blockedTimes = configDia.blockedTimes.filter(x => x !== h);
                } else {
                    configDia.blockedTimes.push(h);
                }
                await salvar();
                renderizarGrade();
            };
            container.appendChild(div);
            curr.setMinutes(curr.getMinutes() + 20);
        }
    } catch (e) {
        console.error("Erro ao gerar grade:", e);
    }
}

async function salvar() {
    await fetch("/api/admin/save-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: agendaDate.value, ...configDia })
    });
}

// --- GESTÃO DE AGENDAMENTOS ---

async function listarAgendados(date) {
    const r = await fetch(`/api/admin/appointments?date=${date}`);
    let list = await r.json();

    list.sort((a, b) => a.time.localeCompare(b.time));

    const container = document.getElementById("agenda");
    container.innerHTML = list.map(a => {
        const [ano, mes, dia] = a.date.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;

        return `
            <div class="card-agendamento">
                <div>
                    <span style="font-size: 1.2rem; font-weight: bold; color: #0056b3;">${a.time}</span> - 
                    <b>${a.name}</b> 
                    <br>
                    <small>✂️ ${a.service || 'Corte'} | 📱 ${a.phone}</small>
                </div>
                <div class="acoes">
                    <button onclick="lembrar('${a.name}','${a.phone}','${dataFormatada}','${a.time}')" style="background:#25d366; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer">📲</button>
                    <button onclick="deletarAp(${a.id})" style="background:#ff4d4d; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer">❌</button>
                </div>
            </div>
        `;
    }).join('') || "<p>Sem agendamentos para este dia.</p>";
}

function lembrar(n, t, d, h) {
    const msg = `Tranquilo ${n}, passei pra lembrar do seu horário, ${d} às ${h}. Qualquer imprevisto, avisa a gente, valeu`;
    window.open(`https://wa.me/55${t.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`);
}

async function deletarAp(id) {
    if(confirm("Deseja cancelar este agendamento?")) {
        await fetch(`/api/appointments/${id}`, { method: "DELETE" });
        carregarTudo();
    }
}

async function bloquearDia() {
    configDia.isDayClosed = !configDia.isDayClosed;
    await salvar();
    carregarTudo();
}

async function configurarHorarioDia() {
    const o = prompt("Abertura (HH:MM):", configDia.open);
    const c = prompt("Fechamento (HH:MM):", configDia.close);
    if(o && c) { configDia.open = o; configDia.close = c; await salvar(); carregarTudo(); }
}

// --- GESTÃO DE SERVIÇOS (PADRÃO INDEX) ---

async function addService() {
    const title = document.getElementById("title").value;
    const price = document.getElementById("price").value;
    const duration = document.getElementById("duration").value;
    const foto = document.getElementById("foto").files[0];

    if (!title || !price) return alert("Preencha título e preço!");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("price", price);
    formData.append("duration", duration);
    if (foto) formData.append("foto", foto);

    const res = await fetch("/api/services", { method: "POST", body: formData });

    if (res.ok) {
        alert("✅ Serviço adicionado com sucesso!");
        document.getElementById("title").value = "";
        document.getElementById("price").value = "";
        carregarServicosAdmin();
    }
}

async function carregarServicosAdmin() {
    const r = await fetch("/api/services");
    const services = await r.json();
    const div = document.getElementById("listaServicosAdmin");

    // Aqui usamos as mesmas classes .srv-card e .srv-img do seu INDEX
    div.innerHTML = services.map(s => `
        <div class="srv-card" style="cursor: default; justify-content: space-between; border-color: #d0e0f0;">
            <div style="display: flex; align-items: center;">
                <img src="${s.image}" class="srv-img" onerror="this.src='/no-image.png'">
                <div class="srv-info">
                    <b>${s.title}</b><br>
                    <span class="price-tag">R$ ${s.price}</span> 
                    <small>(${s.duration} min)</small>
                </div>
            </div>
            <div class="acoes">
                <button onclick="deletarServico(${s.id})" 
                        style="background:#ff4d4d; border:none; padding:10px; border-radius:8px; color:white; cursor:pointer; width: auto; margin: 0;">
                    🗑️ Excluir
                </button>
            </div>
        </div>
    `).join('') || "<p>Nenhum serviço cadastrado.</p>";
}

async function deletarServico(id) {
    if (confirm("⚠️ Excluir este serviço e sua imagem permanentemente?")) {
        const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
        if (res.ok) {
            alert("✅ Serviço removido!");
            carregarServicosAdmin();
        }
    }
}

// --- INICIALIZAÇÃO ---

agendaDate.value = new Date().toISOString().split('T')[0];
agendaDate.addEventListener("change", carregarTudo);

// Executa ao carregar a página
carregarTudo();
carregarServicosAdmin();