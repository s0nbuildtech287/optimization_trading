const nodemailer = require('nodemailer');
const emailConfig = require('../config/emailConfig');

// ✅ Tạo transporter với Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailConfig.EMAIL_USER,
    pass: emailConfig.EMAIL_APP_PASSWORD
  }
});

/**
 * ✅ Gửi OTP email
 */
const sendOTPEmail = async (email, otp, username) => {
  const mailOptions = {
    from: emailConfig.EMAIL_FROM,
    to: email,
    subject: '🔐 Lotusquant - Email Verification Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
            color: white;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .otp-box {
            background-color: #f8f9fa;
            border: 2px dashed #667eea;
            border-radius: 8px;
            padding: 25px;
            text-align: center;
            margin: 30px 0;
          }
          .otp-code {
            font-size: 36px;
            font-weight: 700;
            color: #667eea;
            letter-spacing: 8px;
            margin: 10px 0;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
          }
          .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌸 Lotusquant</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Email Verification</p>
          </div>
          
          <div class="content">
            <h2 style="color: #333; margin-top: 0;">Hello ${username}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Thank you for registering with Lotusquant. To complete your registration, 
              please use the verification code below:
            </p>
            
            <div class="otp-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Your verification code</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 0; color: #999; font-size: 13px;">
                Valid for ${emailConfig.OTP_EXPIRY_MINUTES} minutes
              </p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <p style="margin: 5px 0 0 0; color: #856404;">
                Never share this code with anyone. Lotusquant will never ask for your verification code.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Lotusquant. All rights reserved.</p>
            <p style="margin: 10px 0 0 0;">This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    throw new Error('Failed to send verification email');
  }
};

module.exports = {
  sendOTPEmail
};