require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4"
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

function signAdmin(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No autorizado" });
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

app.get("/api/rifas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM boletos b WHERE b.rifa_id=r.id AND b.estado='vendido') AS vendidos
      FROM rifas r
      WHERE r.estado <> 'finalizada'
      ORDER BY r.id DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "No se pudieron cargar las rifas" });
  }
});

app.get("/api/rifas/:id", async (req, res) => {
  try {
    const [rifas] = await pool.execute("SELECT * FROM rifas WHERE id=?", [req.params.id]);
    if (!rifas.length) return res.status(404).json({ error: "Rifa no encontrada" });
    const [paquetes] = await pool.execute(
      "SELECT * FROM paquetes WHERE rifa_id=? ORDER BY cantidad",
      [req.params.id]
    );
    const [bancos] = await pool.query(
      "SELECT id,banco,tipo_cuenta,titular,numero FROM cuentas_bancarias WHERE activa=1 ORDER BY id"
    );
    res.json({ ...rifas[0], paquetes, bancos });
  } catch {
    res.status(500).json({ error: "No se pudo cargar la rifa" });
  }
});

app.post("/api/pagos", upload.single("comprobante"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { rifa_id, nombre, telefono, correo, cantidad_boletos, monto, banco, referencia, consentimiento } = req.body;

    if (!rifa_id || !nombre || !telefono || !cantidad_boletos || !monto || consentimiento !== "1") {
      return res.status(400).json({ error: "Faltan datos obligatorios." });
    }

    const cleanPhone = String(telefono).replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: "El teléfono debe tener al menos 10 dígitos." });
    }

    if (!req.file) return res.status(400).json({ error: "Debes subir el comprobante." });

    await conn.beginTransaction();

    const [existing] = await conn.execute(
      "SELECT id FROM clientes WHERE telefono=? LIMIT 1", [cleanPhone]
    );

    let clienteId;
    if (existing.length) {
      clienteId = existing[0].id;
      await conn.execute(
        "UPDATE clientes SET nombre=?, correo=? WHERE id=?",
        [nombre.trim(), correo || null, clienteId]
      );
    } else {
      const [r] = await conn.execute(
        "INSERT INTO clientes (nombre,telefono,correo) VALUES (?,?,?)",
        [nombre.trim(), cleanPhone, correo || null]
      );
      clienteId = r.insertId;
    }

    const [rifaRows] = await conn.execute(
      "SELECT id, precio_boleto, estado, cantidad_boletos FROM rifas WHERE id=? FOR UPDATE",
      [rifa_id]
    );
    if (!rifaRows.length || rifaRows[0].estado !== "activa") {
      throw new Error("La rifa no está disponible.");
    }

    const qty = Number(cantidad_boletos);
    const total = Number(monto);
    if (!Number.isInteger(qty) || qty < 2 || qty > 10000) throw new Error("Cantidad de boletos inválida.");
    if (!Number.isFinite(total) || total !== qty * Number(rifaRows[0].precio_boleto)) {
      throw new Error("El monto no coincide con la cantidad.");
    }

    const [pay] = await conn.execute(
      `INSERT INTO pagos
       (cliente_id, rifa_id, cantidad_boletos, monto, banco, referencia, comprobante)
       VALUES (?,?,?,?,?,?,?)`,
      [clienteId, rifa_id, qty, total, banco || null, referencia || null, req.file.filename]
    );

    await conn.commit();

    res.status(201).json({
      ok: true,
      pago_id: pay.insertId,
      message: "Solicitud recibida. El administrador validará el comprobante."
    });
  } catch (e) {
    await conn.rollback();
    if (req.file) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    }
    res.status(400).json({ error: e.message || "No se pudo registrar el pago." });
  } finally {
    conn.release();
  }
});

app.get("/api/consulta", async (req, res) => {
  try {
    const { rifa_id, q } = req.query;
    if (!rifa_id || !q) return res.status(400).json({ error: "Selecciona una rifa y escribe un teléfono o boleto." });

    const digits = String(q).replace(/\D/g, "");
    if (digits.length === 10) {
      const [rows] = await pool.execute(`
        SELECT b.numero, b.estado, r.nombre AS rifa
        FROM boletos b
        JOIN clientes c ON c.id=b.cliente_id
        JOIN rifas r ON r.id=b.rifa_id
        WHERE b.rifa_id=? AND c.telefono=? AND b.estado='vendido'
        ORDER BY b.numero
      `, [rifa_id, digits]);
      return res.json({ tipo: "telefono", boletos: rows });
    }

    if (digits.length >= 1 && digits.length <= 5) {
      const number = Number(digits);
      const [rows] = await pool.execute(`
        SELECT b.numero, b.estado, c.nombre, r.nombre AS rifa
        FROM boletos b
        JOIN rifas r ON r.id=b.rifa_id
        LEFT JOIN clientes c ON c.id=b.cliente_id
        WHERE b.rifa_id=? AND b.numero=?
      `, [rifa_id, number]);
      return res.json({ tipo: "boleto", boletos: rows });
    }

    res.status(400).json({ error: "Usa un teléfono de 10 dígitos o un número de boleto." });
  } catch {
    res.status(500).json({ error: "No se pudo realizar la consulta." });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute("SELECT * FROM admins WHERE email=? LIMIT 1", [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }
    res.json({ token: signAdmin(rows[0]), email: rows[0].email });
  } catch {
    res.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

app.get("/api/admin/pagos", requireAdmin, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.*, c.nombre, c.telefono, c.correo, r.nombre AS rifa
    FROM pagos p
    JOIN clientes c ON c.id=p.cliente_id
    JOIN rifas r ON r.id=p.rifa_id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

app.post("/api/admin/pagos/:id/validar", requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [payments] = await conn.execute(
      "SELECT * FROM pagos WHERE id=? FOR UPDATE", [req.params.id]
    );
    if (!payments.length) throw new Error("Pago no encontrado.");
    const payment = payments[0];

    if (payment.estado !== "pendiente") throw new Error("El pago ya fue procesado.");

    const [available] = await conn.execute(
      `SELECT id, numero FROM boletos
       WHERE rifa_id=? AND estado='disponible'
       ORDER BY RAND() LIMIT ? FOR UPDATE`,
      [payment.rifa_id, payment.cantidad_boletos]
    );

    if (available.length !== payment.cantidad_boletos) {
      throw new Error("No hay suficientes boletos disponibles.");
    }

    for (const ticket of available) {
      await conn.execute(
        `UPDATE boletos
         SET estado='vendido', cliente_id=?, pago_id=?, assigned_at=NOW()
         WHERE id=?`,
        [payment.cliente_id, payment.id, ticket.id]
      );
    }

    await conn.execute(
      "UPDATE pagos SET estado='validado', validated_at=NOW() WHERE id=?",
      [payment.id]
    );

    await conn.commit();

    res.json({
      ok: true,
      numeros: available.map(x => String(x.numero).padStart(4, "0"))
    });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.post("/api/admin/pagos/:id/rechazar", requireAdmin, async (req, res) => {
  const { notas } = req.body;
  await pool.execute(
    "UPDATE pagos SET estado='rechazado', notas_admin=? WHERE id=? AND estado='pendiente'",
    [notas || null, req.params.id]
  );
  res.json({ ok: true });
});

app.post("/api/admin/rifas/:id/generar-boletos", requireAdmin, async (req, res) => {
  const [rows] = await pool.execute("SELECT cantidad_boletos FROM rifas WHERE id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Rifa no encontrada." });

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM boletos WHERE rifa_id=?", [req.params.id]
  );
  if (Number(countRows[0].total) > 0) {
    return res.json({ ok: true, message: "Los boletos ya fueron generados." });
  }

  const qty = Number(rows[0].cantidad_boletos);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 1; i <= qty; i++) {
      await conn.execute(
        "INSERT INTO boletos (rifa_id, numero) VALUES (?,?)",
        [req.params.id, i]
      );
    }
    await conn.commit();
    res.json({ ok: true, message: `${qty} boletos generados.` });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: "No se pudieron generar los boletos." });
  } finally {
    conn.release();
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Rifas Luxury RD ejecutándose en http://localhost:${PORT}`);
});
