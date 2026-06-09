require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const { pool }   = require("./database");
const path       = require("path");

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "logistik-secret-key-2026";

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── LOGGER SEDERHANA ─────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── VALIDASI SEDERHANA (pengganti Joi/Zod) ───────────────────
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body[field];
      if (rules.required && (val === undefined || val === null || val === "")) {
        errors.push(`${field} wajib diisi`);
        continue;
      }
      if (val !== undefined && val !== "") {
        if (rules.minLength && String(val).length < rules.minLength)
          errors.push(`${field} minimal ${rules.minLength} karakter`);
        if (rules.maxLength && String(val).length > rules.maxLength)
          errors.push(`${field} maksimal ${rules.maxLength} karakter`);
        if (rules.enum && !rules.enum.includes(val))
          errors.push(`${field} harus salah satu dari: ${rules.enum.join(", ")}`);
        if (rules.type === "number" && isNaN(val))
          errors.push(`${field} harus berupa angka`);
      }
    }
    if (errors.length > 0)
      return res.status(400).json({ error: "Validasi gagal", details: errors });
    next();
  };
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token tidak ditemukan" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token tidak valid atau kadaluarsa" });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Akses ditolak: role tidak diizinkan" });
    next();
  };
}

// ─── AUTH ─────────────────────────────────────────────────────
app.post("/api/login",
  validate({
    username: { required: true },
    password: { required: true },
  }),
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
      const user = rows[0];
      if (!user || !bcrypt.compareSync(password, user.password))
        return res.status(401).json({ error: "Username atau password salah" });
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap } });
    } catch (err) { next(err); }
  }
);

app.post("/api/register",
  validate({
    nama:     { required: true, minLength: 3 },
    username: { required: true, minLength: 3, maxLength: 20 },
    password: { required: true, minLength: 8 },
    role:     { required: true, enum: ["dispatcher", "kurir", "customer"] },
  }),
  async (req, res, next) => {
    try {
      const { nama, username, email, role, telepon, password } = req.body;
      const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
      if (existing.length > 0)
        return res.status(409).json({ error: "Username sudah digunakan" });

      const hashed = bcrypt.hashSync(password, 10);
      const [cols] = await pool.query("SHOW COLUMNS FROM users");
      const colNames = cols.map(c => c.Field);

      let fields = "username, password, role, nama_lengkap";
      let values = [username, hashed, role, nama];
      if (colNames.includes("email"))   { fields += ", email";   values.push(email   || null); }
      if (colNames.includes("telepon")) { fields += ", telepon"; values.push(telepon || null); }

      await pool.query(
        `INSERT INTO users (${fields}) VALUES (${values.map(() => "?").join(",")})`,
        values
      );
      res.status(201).json({ message: "Registrasi berhasil" });
    } catch (err) { next(err); }
  }
);

// ─── DASHBOARD ────────────────────────────────────────────────
app.get("/api/dashboard", authenticate, async (req, res, next) => {
  try {
    const { dari, sampai } = req.query;
    let dateFilter = "";
    const dateParams = [];
    if (dari && sampai) {
      dateFilter = " AND DATE(p.created_at) BETWEEN ? AND ?";
      dateParams.push(dari, sampai);
    }

    const q = async (sql, p = []) => (await pool.query(sql, p))[0][0].c;
    const totalPaket      = await q(`SELECT COUNT(*) as c FROM paket p WHERE 1=1${dateFilter}`, dateParams);
    const terkirim        = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='terkirim'${dateFilter}`, dateParams);
    const dalamPengiriman = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='dalam_pengiriman'${dateFilter}`, dateParams);
    const retur           = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='retur'${dateFilter}`, dateParams);
    const gagal           = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='gagal'${dateFilter}`, dateParams);
    const onTime          = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='terkirim' AND tanggal_terima<=tanggal_estimasi${dateFilter}`, dateParams);
    const late            = await q(`SELECT COUNT(*) as c FROM paket p WHERE status='terkirim' AND tanggal_terima>tanggal_estimasi${dateFilter}`, dateParams);

    const ontimeRate = terkirim > 0 ? ((onTime / terkirim) * 100).toFixed(1) : 0;
    const returRate  = totalPaket > 0 ? ((retur / totalPaket) * 100).toFixed(1) : 0;

    const [kepadatanRute] = await pool.query(`
      SELECT r.kode_rute, r.nama_rute,
        COUNT(p.id) as jumlah_paket,
        COUNT(CASE WHEN p.status='dalam_pengiriman' THEN 1 END) as aktif,
        COUNT(CASE WHEN p.status='terkirim'         THEN 1 END) as selesai,
        COUNT(CASE WHEN p.status='retur'            THEN 1 END) as retur_count
      FROM rute r LEFT JOIN paket p ON r.id=p.rute_id
      GROUP BY r.id ORDER BY jumlah_paket DESC`);

    const [statsKurir] = await pool.query(`
      SELECT k.nama, k.status,
        COUNT(p.id) as total_tugas,
        COUNT(CASE WHEN p.status='terkirim' THEN 1 END) as sukses
      FROM kurir k LEFT JOIN paket p ON k.id=p.kurir_id
      GROUP BY k.id`);

    res.json({ totalPaket, terkirim, dalamPengiriman, retur, gagal,
      ontimeRate: parseFloat(ontimeRate), late, returRate: parseFloat(returRate),
      kepadatanRute, statsKurir });
  } catch (err) { next(err); }
});

// ─── PAKET ────────────────────────────────────────────────────
app.get("/api/paket", authenticate, async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT p.*, r.nama_rute, r.kode_rute, k.nama as nama_kurir,
               h1.nama_hub as hub_asal, h2.nama_hub as hub_tujuan
               FROM paket p
               LEFT JOIN rute r  ON p.rute_id=r.id
               LEFT JOIN kurir k ON p.kurir_id=k.id
               LEFT JOIN hubs h1 ON p.hub_asal_id=h1.id
               LEFT JOIN hubs h2 ON p.hub_tujuan_id=h2.id
               WHERE 1=1`;
    const params = [];
    if (search) { sql += ` AND (p.nomor_resi LIKE ? OR p.penerima LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (status) { sql += ` AND p.status = ?`; params.push(status); }
    if (req.user.role === "customer") { sql += ` AND (p.pengirim=? OR p.penerima=?)`; params.push(req.user.username, req.user.username); }
    sql += " ORDER BY p.created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

app.post("/api/paket", authenticate, authorize("dispatcher"),
  validate({
    pengirim:       { required: true },
    penerima:       { required: true },
    alamat_tujuan:  { required: true },
    berat_kg:       { required: true, type: "number" },
  }),
  async (req, res, next) => {
    try {
      const { pengirim, penerima, alamat_tujuan, berat_kg, rute_id, kurir_id, hub_asal_id, hub_tujuan_id, tanggal_estimasi } = req.body;
      const resi = `RESI${Date.now().toString().slice(-6)}${Math.floor(Math.random()*9000+1000)}`;
      const [result] = await pool.query(
        `INSERT INTO paket (nomor_resi,pengirim,penerima,alamat_tujuan,berat_kg,rute_id,kurir_id,hub_asal_id,hub_tujuan_id,tanggal_estimasi) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [resi, pengirim, penerima, alamat_tujuan, berat_kg, rute_id||null, kurir_id||null, hub_asal_id||null, hub_tujuan_id||null, tanggal_estimasi||null]
      );
      await pool.query(`INSERT INTO tracking_log (paket_id,status,lokasi,keterangan) VALUES (?,'diterima',?,'Paket diterima di hub asal')`, [result.insertId, hub_asal_id||null]);
      res.status(201).json({ id: result.insertId, nomor_resi: resi });
    } catch (err) { next(err); }
  }
);

app.put("/api/paket/:id/status", authenticate,
  validate({ status: { required: true, enum: ["dalam_pengiriman","terkirim","retur","gagal"] } }),
  async (req, res, next) => {
    try {
      const { status, keterangan } = req.body;
      const [paket] = await pool.query("SELECT id FROM paket WHERE id=?", [req.params.id]);
      if (!paket[0]) return res.status(404).json({ error: "Paket tidak ditemukan" });
      if (status === "terkirim")
        await pool.query("UPDATE paket SET status=?, tanggal_terima=CURRENT_TIMESTAMP WHERE id=?", [status, req.params.id]);
      else if (status === "retur" || status === "gagal")
        await pool.query("UPDATE paket SET status=?, catatan_retur=? WHERE id=?", [status, keterangan||null, req.params.id]);
      else
        await pool.query("UPDATE paket SET status=? WHERE id=?", [status, req.params.id]);
      await pool.query(`INSERT INTO tracking_log (paket_id,status,lokasi,keterangan) VALUES (?,?,'di transit',?)`, [req.params.id, status, keterangan||""]);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

app.delete("/api/paket/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    const [paket] = await pool.query("SELECT id FROM paket WHERE id=?", [req.params.id]);
    if (!paket[0]) return res.status(404).json({ error: "Paket tidak ditemukan" });
    await pool.query("DELETE FROM paket WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── KURIR ────────────────────────────────────────────────────
app.get("/api/kurir", authenticate, async (req, res, next) => {
  try {
    const [data] = await pool.query(`SELECT k.*, u.username FROM kurir k LEFT JOIN users u ON k.user_id=u.id ORDER BY k.created_at DESC`);
    res.json(data);
  } catch (err) { next(err); }
});
app.post("/api/kurir", authenticate, authorize("dispatcher"),
  validate({ nama: { required: true } }),
  async (req, res, next) => {
    try {
      const { nama, no_hp, plat_kendaraan, status } = req.body;
      const [r] = await pool.query("INSERT INTO kurir (nama,no_hp,plat_kendaraan,status) VALUES (?,?,?,?)", [nama, no_hp||null, plat_kendaraan||null, status||"tersedia"]);
      res.status(201).json({ id: r.insertId });
    } catch (err) { next(err); }
  }
);
app.put("/api/kurir/:id", authenticate, authorize("dispatcher"),
  validate({ nama: { required: true } }),
  async (req, res, next) => {
    try {
      const { nama, no_hp, plat_kendaraan, status } = req.body;
      await pool.query("UPDATE kurir SET nama=?,no_hp=?,plat_kendaraan=?,status=? WHERE id=?", [nama, no_hp, plat_kendaraan, status, req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);
app.delete("/api/kurir/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM kurir WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── RUTE ─────────────────────────────────────────────────────
app.get("/api/rute", authenticate, async (req, res, next) => {
  try {
    const [data] = await pool.query(`SELECT r.*, h1.nama_hub as asal, h2.nama_hub as tujuan FROM rute r LEFT JOIN hubs h1 ON r.asal_hub_id=h1.id LEFT JOIN hubs h2 ON r.tujuan_hub_id=h2.id ORDER BY r.created_at DESC`);
    res.json(data);
  } catch (err) { next(err); }
});
app.post("/api/rute", authenticate, authorize("dispatcher"),
  validate({ kode_rute: { required: true }, nama_rute: { required: true }, asal_hub_id: { required: true }, tujuan_hub_id: { required: true } }),
  async (req, res, next) => {
    try {
      const { kode_rute, nama_rute, asal_hub_id, tujuan_hub_id, jarak_km, estimasi_waktu_menit } = req.body;
      const [r] = await pool.query("INSERT INTO rute (kode_rute,nama_rute,asal_hub_id,tujuan_hub_id,jarak_km,estimasi_waktu_menit) VALUES (?,?,?,?,?,?)", [kode_rute, nama_rute, asal_hub_id, tujuan_hub_id, jarak_km||0, estimasi_waktu_menit||0]);
      res.status(201).json({ id: r.insertId });
    } catch (err) { next(err); }
  }
);
app.put("/api/rute/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    const { kode_rute, nama_rute, asal_hub_id, tujuan_hub_id, jarak_km, estimasi_waktu_menit, status } = req.body;
    await pool.query("UPDATE rute SET kode_rute=?,nama_rute=?,asal_hub_id=?,tujuan_hub_id=?,jarak_km=?,estimasi_waktu_menit=?,status=? WHERE id=?", [kode_rute, nama_rute, asal_hub_id, tujuan_hub_id, jarak_km, estimasi_waktu_menit, status, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});
app.delete("/api/rute/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM rute WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── HUB ──────────────────────────────────────────────────────
app.get("/api/hub", authenticate, async (req, res, next) => {
  try {
    const [data] = await pool.query("SELECT * FROM hubs ORDER BY created_at DESC");
    res.json(data);
  } catch (err) { next(err); }
});
app.post("/api/hub", authenticate, authorize("dispatcher"),
  validate({ nama_hub: { required: true }, kota: { required: true }, alamat: { required: true } }),
  async (req, res, next) => {
    try {
      const { nama_hub, alamat, kota, kapasitas, telepon } = req.body;
      const [r] = await pool.query("INSERT INTO hubs (nama_hub,alamat,kota,kapasitas,telepon) VALUES (?,?,?,?,?)", [nama_hub, alamat, kota, kapasitas||0, telepon||null]);
      res.status(201).json({ id: r.insertId });
    } catch (err) { next(err); }
  }
);
app.put("/api/hub/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    const { nama_hub, alamat, kota, kapasitas, telepon } = req.body;
    await pool.query("UPDATE hubs SET nama_hub=?,alamat=?,kota=?,kapasitas=?,telepon=? WHERE id=?", [nama_hub, alamat, kota, kapasitas, telepon, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});
app.delete("/api/hub/:id", authenticate, authorize("dispatcher"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM hubs WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── TRACKING ─────────────────────────────────────────────────
app.get("/api/track/:resi", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT p.*, r.nama_rute, k.nama as nama_kurir FROM paket p LEFT JOIN rute r ON p.rute_id=r.id LEFT JOIN kurir k ON p.kurir_id=k.id WHERE p.nomor_resi=?`, [req.params.resi]);
    if (!rows[0]) return res.status(404).json({ error: "Paket tidak ditemukan" });
    const [logs] = await pool.query("SELECT * FROM tracking_log WHERE paket_id=? ORDER BY created_at DESC", [rows[0].id]);
    res.json({ paket: rows[0], logs });
  } catch (err) { next(err); }
});

// ─── ERROR HANDLER TERPUSAT ───────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
