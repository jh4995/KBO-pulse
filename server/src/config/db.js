const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "kbo_user",
  password: process.env.DB_PASSWORD || "kbo_pass_1234",
  database: process.env.DB_NAME || "kbo_db",
  max: 20,
});

async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    return { status: "ok", db_time: result.rows[0].current_time };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

module.exports = { pool, testConnection };
