// routes/auth.routes.js
const express = require("express");
const router = express.Router();
const { signin, signup, requestOTP } = require("../controller/authController");
const { verifyToken, isAdmin, isModerator } = require("../middlewares/authJwt");

/**
 * @swagger
 * tags:
 * name: Authentication
 * description: User authentication and authorization
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: The user's unique username.
 *                 example: john_doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The user's unique email address.
 *                 example: john.doe@example.com
 *               password:
 *                 type: boolean
 *                 format: password
 *                 description: The user's password.
 *                 example: "123"
 *     responses:
 *       200:
 *         description: User was registered successfully!
 *       400:
 *         description: Bad request (e.g., username/email already exists).
 *       500:
 *         description: Server error.
 */
router.post("/auth/register", signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in a user and get a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: john_doe
 *               password:
 *                 type: boolean
 *                 format: password
 *                 example: "123"
 *     responses:
 *       200:
 *         description: User was registered successfully!
 *       400:
 *         description: Bad request (e.g., username/email already exists).
 *       500:
 *         description: Server error.
 */
router.post("/auth/login", signin);

// /**
//  * @swagger
//  * /test/user:
//  * get:
//  * summary: Get public content for a logged-in user
//  * tags: [Authentication]
//  * security:
//  * - bearerAuth: []
//  * responses:
//  * 200:
//  * description: Returns public content for a user.
//  * 401:
//  * description: Unauthorized.
//  */
// router.get('/test/user', verifyToken, (req, res) => {
//   res.status(200).send('Public Content for User');
// });

// /**
//  * @swagger
//  * /test/moderator:
//  * get:
//  * summary: Get content for a moderator
//  * tags: [Authentication]
//  * security:
//  * - bearerAuth: []
//  * responses:
//  * 200:
//  * description: Returns content for a moderator.
//  * 403:
//  * description: Forbidden, requires moderator role.
//  */
// router.get('/test/moderator', [verifyToken, isModerator], (req, res) => {
//   res.status(200).send('Public Content for Moderator');
// });

// /**
//  * @swagger
//  * /test/admin:
//  * get:
//  * summary: Get content for an admin
//  * tags: [Authentication]
//  * security:
//  * - bearerAuth: []
//  * responses:
//  * 200:
//  * description: Returns content for an admin.
//  * 403:
//  * description: Forbidden, requires admin role.
//  */
// router.get('/test/admin', [verifyToken, isAdmin], (req, res) => {
//   res.status(200).send('Public Content for Admin');
// });
router.post('/auth/request-otp', requestOTP);  
module.exports = router;
