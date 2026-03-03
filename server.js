const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const app = express();

app.use(express.json());
app.use(express.static("public"));

// Criar pastas se não existirem
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

/* --- ROTAS DE SERVIÇOS (COM DELETE DE IMAGEM CORRIGIDO) --- */

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

app.delete("/api/services/:id", (req, res) => {
    try {
        const idParaRemover = req.params.id;
        let services = read("services.json");
        const servico = services.find(s => s.id == idParaRemover);

        if (servico) {
            // Tenta apagar a imagem física
            if (servico.image && servico.image !== "/no-image.png") {
                const caminhoImagem = path.join(__dirname, "public", servico.image);
                if (fs.existsSync(caminhoImagem)) fs.unlinkSync(caminhoImagem);
            }
            // Filtra e salva
            const novaLista = services.filter(s => s.id != idParaRemover);
            write("services.json", novaLista);
            return res.json({ success: true });
        }
        res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

/* --- ROTAS DE AGENDAMENTO --- */

app.get("/api/available-times", (req, res) => {
    const { date, duration } = req.query;
    const schedule = read("schedule.json");
    const appointments = read("appointments.json");
    const config = schedule.dailyConfigs?.[date] || { open: "08:00", close: "20:00", blockedTimes: [], isDayClosed: false };

    if (config.isDayClosed) return res.json([]);

    let times = [];
    let curr = new Date(`${date}T${config.open}:00`);
    let end = new Date(`${date}T${config.close}:00`);
    const agora = new Date();
    const hojeData = agora.toISOString().split('T')[0];
    const horaAtual = agora.toTimeString().substring(0, 5);

    while (curr <= end) {
        const h = curr.toTimeString().substring(0, 5);
        if (date !== hojeData || h > horaAtual) times.push(h);
        curr.setMinutes(curr.getMinutes() + 20);
    }

    const ocupados = appointments.filter(a => a.date === date);
    const bloqueados = config.blockedTimes || [];
    const durSrv = parseInt(duration) || 20;

    const livres = times.filter(t => {
        if (bloqueados.includes(t)) return false;
        const inicio = new Date(`${date}T${t}:00`);
        const fim = new Date(inicio.getTime() + durSrv * 60000);
        if (fim > new Date(`${date}T${config.close}:00`)) return false;

        return !ocupados.some(ap => {
            const apIn = new Date(`${date}T${ap.time}:00`);
            const apFim = new Date(apIn.getTime() + (parseInt(ap.duration) || 20) * 60000);
            return (inicio < apFim && fim > apIn);
        });
    });
    res.json(livres);
});

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

// Rotas Administrativas (Get/Save Schedule e Appointments por data)
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

app.listen(3000, () => console.log("Servidor em http://localhost:3000"));