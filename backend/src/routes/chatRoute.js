// src/routes/chatRoute.js
const express = require('express');
const router = express.Router();
const { getModels, sendMessage } = require('../controller/chatController');
const { verifyToken } = require('../middlewares/authJwt');

router.get('/chat/models', verifyToken, getModels);
router.post('/chat/send', verifyToken, sendMessage);

module.exports = router;
