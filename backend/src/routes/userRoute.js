const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { verifyToken, isAdmin } = require('../middlewares/authJwt');

router.get('/users/profile', [verifyToken], userController.getProfile);
router.put('/users/profile', [verifyToken], userController.updateProfile);

router.get('/users', [verifyToken, isAdmin], userController.listUsers);
router.post('/users', [verifyToken, isAdmin], userController.createUser);
router.put('/users/:id', [verifyToken, isAdmin], userController.updateUser);
router.delete('/users/:id', [verifyToken, isAdmin], userController.deleteUser);

module.exports = router;
