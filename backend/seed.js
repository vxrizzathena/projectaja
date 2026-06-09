const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  const pool = mysql.createPool({ 
    host: "localhost", 
    user: "root", 
    password: "", 
    database: "logistik_db" 
  });
  
  const hash = (p) => bcrypt.hashSync(p, 10);
  
  await pool.query(`
    INSERT IGNORE INTO users (username, password, role, nama_lengkap, telepon) VALUES
    ('dispatcher1', '${hash("admin123")}', 'dispatcher', 'Andi Dispatcher', '081234567890'),
    ('kurir1', '${hash("kurir123")}', 'kurir', 'Budi Kurir', '081234567891'),
    ('customer1', '${hash("user123")}', 'customer', 'Eka Customer', '081234567894')
  `);
  
  console.log("✅ Data user berhasil dibuat!");
  await pool.end();
})();