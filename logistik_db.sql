-- ============================================================
-- DATABASE: logistik_db
-- Aplikasi Pelacakan Distribusi Logistik Kurir Lokal
-- ============================================================

CREATE DATABASE IF NOT EXISTS logistik_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE logistik_db;

-- ─── TABEL USERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  role          ENUM('dispatcher', 'kurir', 'customer') NOT NULL DEFAULT 'customer',
  nama_lengkap  VARCHAR(100) NOT NULL,
  email         VARCHAR(100) DEFAULT NULL,
  telepon       VARCHAR(20)  DEFAULT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─── TABEL HUBS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hubs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nama_hub    VARCHAR(100) NOT NULL,
  alamat      TEXT         NOT NULL,
  kota        VARCHAR(50)  NOT NULL,
  kapasitas   INT          DEFAULT 0,
  telepon     VARCHAR(20)  DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─── TABEL RUTE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rute (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  kode_rute             VARCHAR(20)  NOT NULL UNIQUE,
  nama_rute             VARCHAR(100) NOT NULL,
  asal_hub_id           INT          NOT NULL,
  tujuan_hub_id         INT          NOT NULL,
  jarak_km              DECIMAL(8,2) DEFAULT 0,
  estimasi_waktu_menit  INT          DEFAULT 0,
  status                ENUM('aktif', 'nonaktif') DEFAULT 'aktif',
  created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asal_hub_id)    REFERENCES hubs(id) ON DELETE CASCADE,
  FOREIGN KEY (tujuan_hub_id)  REFERENCES hubs(id) ON DELETE CASCADE
);

-- ─── TABEL KURIR ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kurir (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          DEFAULT NULL,
  nama            VARCHAR(100) NOT NULL,
  no_hp           VARCHAR(20)  DEFAULT NULL,
  plat_kendaraan  VARCHAR(20)  DEFAULT NULL,
  status          ENUM('tersedia', 'sibuk', 'nonaktif') DEFAULT 'tersedia',
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── TABEL PAKET ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paket (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nomor_resi       VARCHAR(30)  NOT NULL UNIQUE,
  pengirim         VARCHAR(100) NOT NULL,
  penerima         VARCHAR(100) NOT NULL,
  alamat_tujuan    TEXT         NOT NULL,
  berat_kg         DECIMAL(6,2) DEFAULT 0,
  rute_id          INT          DEFAULT NULL,
  kurir_id         INT          DEFAULT NULL,
  hub_asal_id      INT          DEFAULT NULL,
  hub_tujuan_id    INT          DEFAULT NULL,
  status           ENUM('diterima','dalam_pengiriman','terkirim','retur','gagal') DEFAULT 'diterima',
  tanggal_estimasi DATE         DEFAULT NULL,
  tanggal_terima   DATETIME     DEFAULT NULL,
  catatan_retur    TEXT         DEFAULT NULL,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rute_id)       REFERENCES rute(id) ON DELETE SET NULL,
  FOREIGN KEY (kurir_id)      REFERENCES kurir(id) ON DELETE SET NULL,
  FOREIGN KEY (hub_asal_id)   REFERENCES hubs(id) ON DELETE SET NULL,
  FOREIGN KEY (hub_tujuan_id) REFERENCES hubs(id) ON DELETE SET NULL
);

-- ─── TABEL TRACKING LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  paket_id    INT          NOT NULL,
  status      VARCHAR(50)  NOT NULL,
  lokasi      VARCHAR(100) DEFAULT NULL,
  keterangan  TEXT         DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paket_id) REFERENCES paket(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEX UNTUK PERFORMA PENCARIAN
-- ============================================================
ALTER TABLE users        ADD INDEX idx_username   (username);
ALTER TABLE paket        ADD INDEX idx_nomor_resi (nomor_resi);
ALTER TABLE paket        ADD INDEX idx_status     (status);
ALTER TABLE paket        ADD INDEX idx_pengirim   (pengirim);
ALTER TABLE paket        ADD INDEX idx_penerima   (penerima);
ALTER TABLE paket        ADD INDEX idx_created_at (created_at);
ALTER TABLE tracking_log ADD INDEX idx_paket_id   (paket_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- ─── USERS ───────────────────────────────────────────────────
-- Password dispatcher1 : admin123
-- Password kurir1      : kurir123
-- Password customer1   : user123
INSERT IGNORE INTO users (username, password, role, nama_lengkap, telepon) VALUES
('dispatcher1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'dispatcher', 'Andi Dispatcher',  '081234567890'),
('kurir1',      '$2a$10$TKh8H1.PfBKwR5ue6L.s3OsX8TgREDpLJLLkHH6KK5Hj5bAd5VmS', 'kurir',      'Budi Kurir',       '081234567891'),
('customer1',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhmW', 'customer',   'Eka Customer',     '081234567894');

-- ─── HUBS ────────────────────────────────────────────────────
INSERT IGNORE INTO hubs (id, nama_hub, alamat, kota, kapasitas, telepon) VALUES
(1, 'Hub Jakarta Pusat',   'Jl. Sudirman No. 1, Jakarta Pusat',   'Jakarta',   500, '021-1234567'),
(2, 'Hub Bandung',         'Jl. Asia Afrika No. 10, Bandung',     'Bandung',   300, '022-1234567'),
(3, 'Hub Surabaya',        'Jl. Pemuda No. 5, Surabaya',          'Surabaya',  400, '031-1234567'),
(4, 'Hub Yogyakarta',      'Jl. Malioboro No. 20, Yogyakarta',    'Yogyakarta',200, '0274-123456'),
(5, 'Hub Semarang',        'Jl. Pemuda No. 15, Semarang',         'Semarang',  250, '024-1234567');

-- ─── RUTE ────────────────────────────────────────────────────
INSERT IGNORE INTO rute (id, kode_rute, nama_rute, asal_hub_id, tujuan_hub_id, jarak_km, estimasi_waktu_menit, status) VALUES
(1, 'RTE-JKT-BDG', 'Jakarta - Bandung',       1, 2, 150.5, 180, 'aktif'),
(2, 'RTE-JKT-SBY', 'Jakarta - Surabaya',      1, 3, 780.0, 720, 'aktif'),
(3, 'RTE-BDG-YGY', 'Bandung - Yogyakarta',    2, 4, 310.0, 300, 'aktif'),
(4, 'RTE-SBY-SMG', 'Surabaya - Semarang',     3, 5, 310.5, 270, 'aktif'),
(5, 'RTE-SMG-YGY', 'Semarang - Yogyakarta',   5, 4,  95.0,  90, 'aktif');

-- ─── KURIR ───────────────────────────────────────────────────
INSERT IGNORE INTO kurir (id, user_id, nama, no_hp, plat_kendaraan, status) VALUES
(1, 2,    'Budi Santoso',    '081234567891', 'B 1234 ABC', 'tersedia'),
(2, NULL, 'Cahyo Wibowo',    '081234567892', 'D 5678 DEF', 'tersedia'),
(3, NULL, 'Deni Firmansyah', '081234567893', 'L 9012 GHI', 'sibuk');

-- ─── PAKET ───────────────────────────────────────────────────
INSERT IGNORE INTO paket (id, nomor_resi, pengirim, penerima, alamat_tujuan, berat_kg, rute_id, kurir_id, hub_asal_id, hub_tujuan_id, status, tanggal_estimasi, tanggal_terima) VALUES
(1, 'RESI001001', 'customer1', 'Ahmad Fauzi',   'Jl. Dago No. 5, Bandung',          2.5, 1, 1, 1, 2, 'terkirim',          '2026-05-30', '2026-05-30 14:00:00'),
(2, 'RESI002002', 'customer1', 'Siti Rahayu',   'Jl. Raya Gubeng No. 10, Surabaya', 1.2, 2, 2, 1, 3, 'dalam_pengiriman',  '2026-06-05', NULL),
(3, 'RESI003003', 'Toko ABC',  'Dewi Susanti',  'Jl. Malioboro No. 8, Yogyakarta',  3.0, 3, 1, 2, 4, 'diterima',          '2026-06-07', NULL),
(4, 'RESI004004', 'Toko XYZ',  'Rudi Hartono',  'Jl. Pemuda No. 3, Semarang',       0.8, 4, 3, 3, 5, 'terkirim',          '2026-05-28', '2026-05-29 10:00:00'),
(5, 'RESI005005', 'customer1', 'Linda Wati',    'Jl. Kaliurang No. 12, Yogyakarta', 5.0, 5, 2, 5, 4, 'retur',             '2026-06-01', NULL);

-- ─── TRACKING LOG ────────────────────────────────────────────
INSERT IGNORE INTO tracking_log (paket_id, status, lokasi, keterangan) VALUES
(1, 'diterima',          '1', 'Paket diterima di hub asal - Jakarta Pusat'),
(1, 'dalam_pengiriman',  '1', 'Paket dalam pengiriman menuju Bandung'),
(1, 'terkirim',          '2', 'Paket berhasil diterima oleh penerima'),
(2, 'diterima',          '1', 'Paket diterima di hub asal - Jakarta Pusat'),
(2, 'dalam_pengiriman',  '1', 'Paket dalam pengiriman menuju Surabaya'),
(3, 'diterima',          '2', 'Paket diterima di hub asal - Bandung'),
(4, 'diterima',          '3', 'Paket diterima di hub asal - Surabaya'),
(4, 'dalam_pengiriman',  '3', 'Paket dalam pengiriman menuju Semarang'),
(4, 'terkirim',          '5', 'Paket berhasil diterima oleh penerima'),
(5, 'diterima',          '5', 'Paket diterima di hub asal - Semarang'),
(5, 'dalam_pengiriman',  '5', 'Paket dalam pengiriman menuju Yogyakarta'),
(5, 'retur',             '5', 'Paket diretur: penerima tidak ada di tempat');
