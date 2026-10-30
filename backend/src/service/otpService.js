const emailConfig = require('../config/emailConfig');
const { OTP } = require('../utils/messages');

// In-memory OTP storage (use Redis in production)
const otpStore = new Map();

/**
 * ✅ Generate random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * ✅ Store OTP với expiry
 */
const storeOTP = (email, otp) => {
  const expiryTime = Date.now() + (emailConfig.OTP_EXPIRY_MINUTES * 60 * 1000);
  
  otpStore.set(email, {
    otp,
    expiryTime,
    attempts: 0
  });
};

/**
 * ✅ Verify OTP
 */
const verifyOTP = (email, inputOTP) => {
  const data = otpStore.get(email);
  
  if (!data) {
    throw { status: 400, message: OTP.NOT_FOUND };
  }
  
  // Check expiry
  if (Date.now() > data.expiryTime) {
    otpStore.delete(email);
    throw { status: 400, message: OTP.EXPIRED };
  }
  
  // Check attempts (max 3)
  if (data.attempts >= 3) {
    otpStore.delete(email);
    throw { status: 429, message: OTP.TOO_MANY_ATTEMPTS };
  }
  
  // Verify OTP
  if (data.otp !== inputOTP) {
    data.attempts += 1;
    otpStore.set(email, data);
    throw { 
      status: 400, 
      message: OTP.INVALID(3 - data.attempts)
    };
  }
  
  // Success - remove OTP
  otpStore.delete(email);
  return true;
};

/**
 * ✅ Clean expired OTPs (chạy định kỳ)
 */
const cleanExpiredOTPs = () => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiryTime) {
      otpStore.delete(email);
    }
  }
};

// Chạy cleanup mỗi 5 phút
setInterval(cleanExpiredOTPs, 5 * 60 * 1000);

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP
};
