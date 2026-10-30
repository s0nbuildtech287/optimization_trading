const authService = require('../service/authService');

/**
 * ✅ Request OTP endpoint
 */
exports.requestOTP = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const result = await authService.requestOTP(username, email, password);
    res.status(200).send(result);
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

/**
 * ✅ Signup with OTP verification
 */
exports.signup = async (req, res) => {
  try {
    const { username, email, password, otp } = req.body;
    const result = await authService.signup(username, email, password, otp);
    res.status(200).send(result);
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message, fields: err.fields });
  }
};

exports.signin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.signin(username, password);
    res.status(200).send(result);
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};