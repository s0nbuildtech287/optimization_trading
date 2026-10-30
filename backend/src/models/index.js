'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

// ✅ Đọc config và replace environment variables
const configFile = require('../config/config.json')[env];
const config = {};
for (const [key, val] of Object.entries(configFile)) {
  if (typeof val === 'string') {
    config[key] = val.replace(/\$\{(\w+)\}/g, (_, envVar) => process.env[envVar]) || val;
  } else {
    config[key] = val;
  }
}

const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], { ...config, logging: false });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, { ...config, logging: false });
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
