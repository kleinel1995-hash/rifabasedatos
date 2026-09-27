require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password || password.includes("CAMBIA_")) {
    throw new Error("Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de crear el administrador.");
  }

  const hash = await bcrypt.hash(password, 12);
  await db.execute(
    `INSERT INTO admins (email, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [email, hash]
  );

  console.log(`Administrador creado/actualizado: ${email}`);
  await db.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
