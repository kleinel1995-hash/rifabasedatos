CREATE DATABASE IF NOT EXISTS rifas_luxury
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rifas_luxury;

CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rifas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  descripcion TEXT,
  imagen_url VARCHAR(500),
  precio_boleto DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  cantidad_boletos INT NOT NULL,
  estado ENUM('activa','pausada','finalizada') NOT NULL DEFAULT 'activa',
  fecha_inicio DATETIME NULL,
  fecha_fin DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE paquetes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rifa_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  cantidad INT NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  destacado BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE
);

CREATE TABLE clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  correo VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_clientes_telefono (telefono)
);

CREATE TABLE pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  rifa_id INT NOT NULL,
  cantidad_boletos INT NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  banco VARCHAR(100) NULL,
  referencia VARCHAR(100) NULL,
  comprobante VARCHAR(255) NULL,
  estado ENUM('pendiente','validado','rechazado') NOT NULL DEFAULT 'pendiente',
  notas_admin TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  validated_at DATETIME NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (rifa_id) REFERENCES rifas(id)
);

CREATE TABLE boletos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rifa_id INT NOT NULL,
  cliente_id INT NULL,
  pago_id INT NULL,
  numero INT NOT NULL,
  estado ENUM('disponible','reservado','vendido') NOT NULL DEFAULT 'disponible',
  assigned_at DATETIME NULL,
  FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE SET NULL,
  UNIQUE KEY uq_rifa_numero (rifa_id, numero),
  INDEX idx_boletos_telefono (cliente_id),
  INDEX idx_boletos_pago (pago_id)
);

CREATE TABLE cuentas_bancarias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  banco VARCHAR(100) NOT NULL,
  tipo_cuenta VARCHAR(50) NOT NULL DEFAULT 'Corriente · DOP',
  titular VARCHAR(150) NOT NULL,
  numero VARCHAR(80) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO rifas
(nombre, slug, descripcion, precio_boleto, cantidad_boletos, estado)
VALUES
('iPhone 17 Pro Max', 'iphone-17-pro-max',
 'Participa por un iPhone 17 Pro Max.', 100.00, 10000, 'activa');

INSERT INTO paquetes (rifa_id, nombre, cantidad, precio, destacado) VALUES
(1, '2 Boletos', 2, 200.00, 0),
(1, '5 Boletos', 5, 500.00, 0),
(1, '15 Boletos', 15, 1500.00, 0),
(1, '30 Boletos', 30, 3000.00, 0),
(1, '100 Boletos', 100, 10000.00, 1);

INSERT INTO cuentas_bancarias (banco, titular, numero)
VALUES
('Banco Popular', 'CONFIGURAR TITULAR', 'CONFIGURAR CUENTA'),
('Banreservas', 'CONFIGURAR TITULAR', 'CONFIGURAR CUENTA'),
('Banco BHD', 'CONFIGURAR TITULAR', 'CONFIGURAR CUENTA');
