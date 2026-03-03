const dateInput = document.getElementById("date");
let srvId = null, srvDur = 20;

dateInput.value = new Date().toISOString().split('T')[0];

document.getElementById("phone").addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "");
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2 ");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    e.target.value = v;
});

async function loadServices() {
    try {
        const r = await fetch("/api/services");
        const list = await r.json();
        
        if (list.length === 0) {
            document.getElementById("services").innerHTML = "<p>Nenhum serviço disponível.</p>";
            return;
        }

        document.getElementById("services").innerHTML = list.map((s, index) => `
            <div class="srv-card ${index === 0 ? 'active' : ''}" onclick="selecionarSrv(this, ${s.id}, ${s.duration})">
                <img src="${s.image}" class="srv-img" onerror="this.src='/no-image.png'">
                <div class="srv-info">
                    <b>${s.title}</b><br>
                    <span class="price-tag">R$ ${s.price}</span> <small>(${s.duration} min)</small>
                    <input type="radio" name="s" id="s${s.id}" style="display:none" ${index === 0 ? 'checked' : ''}>
                </div>
            </div>
        `).join('');

        srvId = list[0].id;
        srvDur = list[0].duration;
        carregarHorarios();
    } catch (err) {
        console.error("Erro ao carregar serviços:", err);
    }
}

function selecionarSrv(elemento, id, dur) {
    document.querySelectorAll('.srv-card').forEach(card => card.classList.remove('active'));
    elemento.classList.add('active');
    elemento.querySelector('input[type="radio"]').checked = true;
    setSrv(id, dur);
}

function setSrv(id, dur) { 
    srvId = id; 
    srvDur = dur; 
    carregarHorarios(); 
}

async function carregarHorarios() {
    const dataValue = dateInput.value;
    const timeSelect = document.getElementById("time");
    if (!dataValue || !srvDur) return;

    // Inicia estado de Loading
    timeSelect.innerHTML = "<option>⌛ Carregando horários...</option>";
    timeSelect.disabled = true;

    try {
        const r = await fetch(`/api/available-times?date=${dataValue}&duration=${srvDur}`);
        const hrs = await r.json();
        
        // Simula um pequeno delay para suavidade (opcional)
        setTimeout(() => {
            timeSelect.disabled = false;
            if (hrs.length === 0) {
                timeSelect.innerHTML = "<option value=''>Indisponível para esta data</option>";
            } else {
                timeSelect.innerHTML = hrs.map(h => `<option value="${h}">${h}</option>`).join('');
            }
        }, 300); 

    } catch (err) {
        timeSelect.disabled = false;
        timeSelect.innerHTML = "<option>Erro ao carregar</option>";
    }
}

// Máscara de telefone (11) 9 9999-9999
document.getElementById("buscarTelefone").addEventListener("input", mascaraFone);
document.getElementById("phone").addEventListener("input", mascaraFone);

function mascaraFone(e) {
    let v = e.target.value.replace(/\D/g, "");
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2 ");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
    e.target.value = v;
}

// Atualização no Agendar para salvar os detalhes do serviço
async function agendar() {
    const name = document.getElementById("name").value;
    const phone = document.getElementById("phone").value;
    const time = document.getElementById("time").value;
    
    // Pega o nome do serviço selecionado para salvar no banco
    const cardAtivo = document.querySelector('.srv-card.active b');
    const serviceName = cardAtivo ? cardAtivo.innerText : "Serviço";

    if (!name || !phone || !srvId || !time) return alert("Preencha todos os campos!");

    const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            name, 
            phone, 
            date: dateInput.value, 
            time, 
            duration: srvDur,
            service: serviceName // Enviando o nome do corte
        })
    });

    if (res.ok) { alert("✅ Agendamento realizado!"); location.reload(); }
}

async function buscar() {
    const tel = document.getElementById("buscarTelefone").value;
    if (!tel) return alert("Digite o telefone.");
    
    const res = await fetch(`/api/appointments/search?phone=${tel}`);
    const data = await res.json();
    
    const meusDiv = document.getElementById("meus");
    meusDiv.innerHTML = data.map(a => {
        // Formata data de YYYY-MM-DD para DD/MM/YYYY
        const [ano, mes, dia] = a.date.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;

        return `
            <div class="card-meu-agendamento">
                <div class="info">
                    <div class="cliente-nome"><p>${a.name} - ${dataFormatada} - ${a.time} - ${a.service || 'Corte'}</p></div>
                </div>
                <button class="btn-cancelar" onclick="cancelarAgendamento(${a.id})">Desmarcar</button>
            </div>
        `;
    }).join('') || "<p>Nenhum agendamento encontrado.</p>";
}

async function cancelarAgendamento(id) {
    if (confirm("Tem certeza que deseja desmarcar este horário?")) {
        const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
        if (res.ok) {
            alert("✅ Agendamento cancelado com sucesso.");
            buscar(); // Atualiza a lista
        } else {
            alert("❌ Erro ao cancelar. Tente novamente.");
        }
    }
}

dateInput.addEventListener("change", carregarHorarios);
loadServices();