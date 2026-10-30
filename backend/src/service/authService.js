const db = require("../models");
const User = db.User;
const Role = db.Role;
const jwt = require("jsonwebtoken");
const { UniqueConstraintError } = require("sequelize");
const emailConfig = require("../config/emailConfig");
const emailService = require("./emailService");
const otpService = require("./otpService");
const { getJwtSecret } = require("../middlewares/authJwt");

const requestOTP = async (username, email, password) => {
  try {
    if (!email.endsWith(emailConfig.ALLOWED_EMAIL_DOMAIN)) {
      throw {
        status: 400,
        message: `Only ${emailConfig.ALLOWED_EMAIL_DOMAIN} emails are allowed`,
      };
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw { status: 400, message: "Username already exists" };
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      throw { status: 400, message: "Email already exists" };
    }

    const otp = otpService.generateOTP();
    otpService.storeOTP(email, otp);
    await emailService.sendOTPEmail(email, otp, username);

    return {
      success: true,
      message: `OTP sent to ${email}. Please check your inbox.`,
      email, // Return email to frontend
    };
  } catch (err) {
    if (err.status) {
      throw err;
    }
    throw { status: 500, message: err.message };
  }
};

const signup = async (username, email, password, otp) => {
  try {
    otpService.verifyOTP(email, otp);

    let role = await Role.findOne({ where: { name: "user" } });
    if (!role) {
      role = await Role.create({ name: "user" });
    }

    const user = await User.create({
      username,
      email,
      password,
      role_id: role.id,
      preferences: {},
    });

    return { success: true, message: "User registered successfully!" };
  } catch (err) {
    if (err.status) {
      throw err;
    }
    if (err instanceof UniqueConstraintError) {
      const fields = err.errors.map((e) => e.path);
      throw { status: 400, message: "Username or email already exists", fields };
    }
    throw { status: 500, message: err.message };
  }
};

const signin = async (usernameOrEmail, password) => {
  try {
    const user = await User.findOne({
      where: {
        [db.Sequelize.Op.or]: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
      include: [{ model: Role }],
    });
    if (!user) {
      console.log(`[AUTH] Login failed — user not found: "${usernameOrEmail}"`);
      throw { status: 404, message: "User not found!" };
    }

    const passwordIsValid = user.validPassword(password);
    if (!passwordIsValid) {
      throw { status: 401, message: "Invalid Password!" };
    }

    const token = jwt.sign({ id: user.id }, getJwtSecret(), {
      expiresIn: 86400,
    });

    const roleName = user.Role ? user.Role.name : "user";
    const authorities = ["ROLE_" + roleName.toUpperCase()];

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.preferences?.fullName || '',
      phone: user.preferences?.phone || '',
      roles: authorities,
      preferences: user.preferences || {},
      accessToken: token,
    };
  } catch (err) {
    if (err.status) {
      throw err;
    }
    throw { status: 500, message: err.message };
  }
};

module.exports = {
  requestOTP,
  signup,
  signin,
};
