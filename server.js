const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const app = express();

app.use(express.json());
app.use(express.static("public"));

// --- FUNÇÃO PARA PEGAR HORA DO BRASIL (CORRIGIDA PARA VERCEL) ---
function getBrazilTime() {
    const agora = new Date();
    // A Vercel opera em UTC. Isso converte para a string do Brasil e cria um novo objeto de data.
    const dataBrasilia = agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    return new Date(dataBrasilia);
}

// Criar pastas (Nota: No Vercel, isso só funciona temporariamente na pasta /tmp)
const folders = ["data", "public/uploads"];
folders.forEach(f => { if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true }); });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const read = (f) => {
    const p = path.join(__dirname, "data", f);
    if (!fs.existsSync(p)) return f.includes("schedule") ? { dailyConfigs: {} } : [];
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return f.includes("schedule") ? { dailyConfigs: {} } : []; }
};

const write = (f, d) => fs.writeFileSync(path.join(__dirname, "data", f), JSON.stringify(d, null, 2));

/* --- ROTAS DE SERVIÇOS --- */
app.get("/api/services", (req, res) => res.json(read("services.json")));

app.post("/api/services", upload.single("foto"), (req, res) => {
    const services = read("services.json");
    const novo = { 
        id: Date.now(), 
        title: req.body.title, 
        price: req.body.price, 
        duration: parseInt(req.body.duration) || 20, 
        image: req.file ? `/uploads/${req.file.filename}` : "/no-image.png" 
    };
    services.push(novo);
    write("services.json", services);
    res.json(novo);
});

/* --- ROTA DE HORÁRIOS DISPONÍVEIS (TOTALMENTE CORRIGIDA) --- */
app.get("/api/available-times", (req, res) => {
    const { date, duration } = req.query;
    const schedule = read("schedule.json");
    const appointments = read("appointments.json");
    
    const config = schedule.dailyConfigs?.[date] || { open: "08:00", close: "20:00", blockedTimes: [], isDayClosed: false };

    if (config.isDayClosed) return res.json([]);

    // Pegamos a hora exata do Brasil agora
    const agoraBrasil = getBrazilTime();
    
    // Formatamos a data atual para YYYY-MM-DD comparável com a string 'date'
    const ano = agoraBrasil.getFullYear();
    const mes = String(agoraBrasil.getMonth() + 1).padStart(2, '0');
    const dia = String(agoraBrasil.getDate()).padStart(2, '0');
    const hojeDataString = `${ano}-${mes}-${dia}`;
    
    const horaAtualString = agoraBrasil.toTimeString().substring(0, 5);

    let times = [];
    let curr = new Date(`${date}T${config.open}:00`);
    let end = new Date(`${date}T${config.close}:00`);

    while (curr <= end) {
        const h = curr.toTimeString().substring(0, 5);
        
        // Regra: Se for um dia depois de hoje, mostra tudo. 
        // Se for hoje, só mostra se a hora do slot (h) for maior que a hora agora.
        if (date > hojeDataString || (date === hojeDataString && h > horaAtualString)) {
            times.push(h);
        }
        curr.setMinutes(curr.getMinutes() + 20);
    }

    const ocupados = appointments.filter(a => a.date === date);
    const bloqueados = config.blockedTimes || [];
    const durSrv = parseInt(duration) || 20;

    const livres = times.filter(t => {
        if (bloqueados.includes(t)) return false;
        const inicio = new Date(`${date}T${t}:00`);
        const fim = new Date(inicio.getTime() + durSrv * 60000);
        
        const limiteFechamento = new Date(`${date}T${config.close}:00`);
        if (fim > limiteFechamento) return false;

        return !ocupados.some(ap => {
            const apIn = new Date(`${date}T${ap.time}:00`);
            const apFim = new Date(apIn.getTime() + (parseInt(ap.duration) || 20) * 60000);
            return (inicio < apFim && fim > apIn);
        });
    });
    res.json(livres);
});

// ... (Restante das rotas POST/DELETE permanecem iguais)
app.post("/api/appointments", (req, res) => {
    const ap = read("appointments.json");
    ap.push({ ...req.body, id: Date.now() });
    write("appointments.json", ap);
    res.json({ success: true });
});

app.get("/api/appointments/search", (req, res) => {
    const { phone } = req.query;
    const limpo = phone.replace(/\D/g, "");
    const list = read("appointments.json").filter(a => a.phone.replace(/\D/g, "") === limpo);
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    res.json(list);
});

app.delete("/api/appointments/:id", (req, res) => {
    let ap = read("appointments.json");
    ap = ap.filter(a => a.id != req.params.id);
    write("appointments.json", ap);
    res.json({ success: true });
});

app.get("/api/admin/get-schedule", (req, res) => {
    const schedule = read("schedule.json");
    res.json(schedule.dailyConfigs?.[req.query.date] || { blockedTimes: [], isDayClosed: false, open: "08:00", close: "20:00" });
});

app.post("/api/admin/save-schedule", (req, res) => {
    const schedule = read("schedule.json");
    if (!schedule.dailyConfigs) schedule.dailyConfigs = {};
    schedule.dailyConfigs[req.body.date] = req.body;
    write("schedule.json", schedule);
    res.json({ success: true });
});

app.get("/api/admin/appointments", (req, res) => {
    res.json(read("appointments.json").filter(a => a.date === req.query.date));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
