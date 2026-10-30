const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.User;
const { runWithRequestActor } = require('../utils/requestContext');
const { JWT } = require('../utils/messages');

const sendUnauthorized = (res, message = JWT.UNAUTHORIZED) => res.status(401).json({
  success: false,
  message,
  errorCode: JWT.UNAUTHORIZED_CODE,
});

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return 'YOUR_SECRET_KEY';
};

const verifyToken = (req, res, next) => {
  let token = req.headers['authorization'];

  if (!token) {
    return sendUnauthorized(res, JWT.NO_TOKEN);
  }

  if (token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  let jwtSecret;
  try {
    jwtSecret = getJwtSecret();
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }

  jwt.verify(token, jwtSecret, async (err, decoded) => {
    if (err) {
      return sendUnauthorized(res);
    }
    try {
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'role_id'],
        include: [{ model: db.Role, attributes: ['name'] }]
      });
      if (!user) {
        return sendUnauthorized(res);
      }
      const role = String(user.Role?.name || 'user').toLowerCase();
      const actor = {
        userId: Number(user.id),
        role,
        isAdmin: role === 'admin',
      };
      req.userId = actor.userId;
      req.actor = actor;
      return runWithRequestActor(actor, next);
    } catch (resolveError) {
      return res.status(500).send({ message: resolveError.message });
    }
  });
};

const isAdmin = async (req, res, next) => {
  try {
    if (req.actor) {
      if (req.actor.isAdmin) return next();
      return res.status(403).send({ message: 'Require Admin Role!' });
    }
    const user = await User.findByPk(req.userId, {
      include: [{ model: db.Role }]
    });
    if (!user) {
      return res.status(404).send({ message: 'User not found!' });
    }
    if (user.Role && user.Role.name === 'admin') {
      next();
      return;
    }
    res.status(403).send({ message: 'Require Admin Role!' });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const isUser = async (req, res, next) => {
  try {
    if (req.actor) {
      if (req.actor.isAdmin || req.actor.role === 'user') return next();
      return res.status(403).send({ message: 'Require User Role!' });
    }
    const user = await User.findByPk(req.userId, {
      include: [{ model: db.Role }]
    });
    if (!user) {
      return res.status(404).send({ message: 'User not found!' });
    }
    if (user.Role && (user.Role.name === 'user' || user.Role.name === 'admin')) {
      next();
      return;
    }
    res.status(403).send({ message: 'Require User Role!' });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  isUser,
  getJwtSecret
};
