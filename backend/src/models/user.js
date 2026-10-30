"use strict";
const { Model } = require("sequelize");
const bcrypt = require("bcryptjs"); // Thêm thư viện bcrypt
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      this.belongsTo(models.Role, {
        foreignKey: "role_id",
      });
    }
    // So sánh mật khẩu - hỗ trợ cả plain text và bcrypt hash
    validPassword(password) {
      // Kiểm tra nếu password trong DB là plain text (không phải bcrypt hash)
      // Bcrypt hash luôn bắt đầu với $2a$, $2b$, $2y$ và có độ dài 60 ký tự
      const isBcryptHash = /^\$2[aby]?\$\d{2}\$/.test(this.password);

      if (isBcryptHash) {
        // So sánh với bcrypt hash
        return bcrypt.compareSync(String(password), this.password);
      } else {
        // So sánh plain text
        return String(password) === this.password;
      }
    }
  }
  User.init(
    {
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "roles",
          key: "id",
        },
      },
      preferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      hooks: {
        beforeCreate: (user) => {
          user.password = String(user.password ?? "");
          const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
          const salt = bcrypt.genSaltSync(rounds);
          user.password = bcrypt.hashSync(user.password, salt);
        },
        beforeUpdate: (user) => {
          if (user.changed("password")) {
            user.password = String(user.password ?? "");
            const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
            const salt = bcrypt.genSaltSync(rounds);
            user.password = bcrypt.hashSync(user.password, salt);
          }
        },
      },
    },
  );
  return User;
};
