/**
 * src/dao/userDao.js
 * DAO xử lý khởi tạo bảng users và roles
 */
const { pool } = require("../config/db");

/**
 * Khởi tạo bảng roles và users (chỉ dùng CREATE TABLE IF NOT EXISTS, không ALTER/DROP)
 */
async function initUserTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      fullname VARCHAR(255),
      image VARCHAR(255),
      role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
  `;

  await pool.query(query);
}

module.exports = {
  initUserTable,
};
