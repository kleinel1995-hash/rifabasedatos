# Rifas Luxury RD

Plataforma web para administrar rifas, registrar pagos, validar comprobantes y asignar boletos aleatoriamente.

## Stack

- HTML/CSS/JavaScript
- Node.js + Express
- MySQL/MariaDB
- JWT para sesión del administrador
- Multer para comprobantes

## 1. Requisitos

Instala Node.js 18+ y MySQL 8+ (o MariaDB compatible).

## 2. Configuración

Copia:

```bash
cp .env.example .env
```

Edita `.env` y coloca las credenciales reales de MySQL y una contraseña/secretos fuertes.

## 3. Base de datos

Ejecuta:

```bash
mysql -u root -p < database/schema.sql
```

Después:

```bash
npm install
node database/seed-admin.js
```

Genera los boletos de la primera rifa desde un cliente MySQL:

```sql
INSERT INTO boletos (rifa_id, numero)
SELECT 1, n
FROM (
  SELECT @n:=@n+1 AS n
  FROM information_schema.columns, (SELECT @n:=0) x
  LIMIT 10000
) numbers;
```

También puedes usar el endpoint administrativo de generación si quieres implementarlo en tu flujo de despliegue.

## 4. Ejecutar

Desarrollo:

```bash
npm run dev
```

Producción:

```bash
npm start
```

Abre:

- `/` página principal
- `/compra.html?rifa=1` compra
- `/consulta.html` consulta de boletos
- `/admin.html` panel administrativo

## Flujo

1. El cliente selecciona una rifa y cantidad.
2. Envía sus datos y comprobante.
3. El pago queda `pendiente`.
4. El administrador revisa el comprobante.
5. Al validar, el sistema toma boletos disponibles al azar y los marca como `vendido`.
6. El cliente puede consultar sus boletos usando su teléfono.

## Seguridad

Nunca subas `.env`, contraseñas, JWT secrets ni comprobantes reales a GitHub.

Para producción se recomienda:

- HTTPS.
- Backups de MySQL.
- Almacenamiento privado para comprobantes.
- Rate limiting.
- Antivirus/validación adicional de archivos.
- Cookies HttpOnly/SameSite para la sesión administrativa.
- Logs y monitoreo.
- Políticas legales y de cumplimiento aplicables a rifas en tu jurisdicción.
