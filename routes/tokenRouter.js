const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const tokenModel = require('../models/tokenModel');
const userModel = require('../models/userModel');

const router = express.Router();
router.use(cookieParser());

const SECRET = process.env.SECRET_KEY ?? 'reward-bot-secret-key';
const REFRESH_SECRET =
	process.env.REFRESH_SECRET_KEY ?? 'reward-bot-refresh-secret-key';

// Validate user credentials
const validateUser = async (email, password) => {
	const user = await userModel.findOne({ email: email });
	if (!user) return null;

	const isMatch = await bcrypt.compare(password, user.password);
	return isMatch ? user : null;
};

const useExistingToken = async (userId) => {
	const token = await tokenModel.findOne({ userId: userId });

	if (!token || token.expiresAt < new Date()) {
		return null;
	}

	return token;
};

// Login
router.post('/login', async (req, res) => {
	const { email, password } = req.body;
	const user = await validateUser(email, password);

	if (!user) {
		return res.status(401).json({ message: 'Invalid credentials' });
	}

	const accessToken = jwt.sign(
		{ userId: user._id, email: user.email },
		SECRET,
		{ expiresIn: '15m' },
	);

	const existingToken = await useExistingToken(user._id);

	if (existingToken) {
		res.cookie('rewardAuthToken', accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
		});

		res.json({
			message: 'Login successful!',
			refreshToken: existingToken.token,
			user,
		});
		return;
	}

	const refreshToken = jwt.sign({ userId: user._id }, REFRESH_SECRET, {
		expiresIn: '7d',
	});

	const token = new tokenModel({
		userId: user._id,
		token: refreshToken,
		type: 'refresh',
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	});
	await token.save();

	res.cookie('rewardAuthToken', accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
	});
	res.json({ message: 'Login successful!', refreshToken, user });
});

router.get('/protected', async (req, res) => {
	const token = req.cookies.rewardAuthToken;

	if (!token) {
		return res.status(401).json({ message: 'No token provided' });
	}

	try {
		// Decode the token
		const decoded = jwt.verify(token, SECRET);

		// Fetch user details from the database
		const user = await userModel
			.findById(decoded.userId)
			.select('-password'); // Exclude the password
		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}

		res.json({ message: 'Access granted', user });
	} catch (err) {
		res.status(403).json({ message: 'Invalid or expired token' });
	}
});

router.post('/refresh', async (req, res) => {
	const { refreshToken } = req.body;

	if (!refreshToken) {
		return res.status(400).json({ message: 'Refresh token is required' });
	}

	const storedToken = await tokenModel.findOne({
		token: refreshToken,
		type: 'refresh',
	});
	if (!storedToken) {
		return res
			.status(403)
			.json({ message: 'Invalid or expired refresh token' });
	}

	try {
		const decoded = jwt.verify(
			refreshToken,
			process.env.REFRESH_SECRET_KEY,
		);
		const newAccessToken = jwt.sign(
			{ userId: decoded.userId },
			process.env.SECRET_KEY,
			{ expiresIn: '15m' },
		);

		res.json({ accessToken: newAccessToken });
	} catch (err) {
		res.status(403).json({ message: 'Invalid or expired refresh token' });
	}
});

// Logout
router.post('/logout', async (req, res) => {
	const { refreshToken } = req.body;

	if (refreshToken) {
		await tokenModel.deleteOne({ token: refreshToken });
	}

	res.clearCookie('rewardAuthToken');
	res.json({ message: 'Logged out successfully' });
});

module.exports = router;
