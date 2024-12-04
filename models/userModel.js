const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Create schema
const userSchema = new mongoose.Schema(
	{
		username: String,
		email: String,
		password: String,
		canvasToken: String,
		option: { type: String, default: 'Week' },
		showCompleted: { type: Boolean, default: true },
		createAt: { type: Date, default: Date.now },
	},
	{ versionKey: false },
);

userSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next();
	this.password = await bcrypt.hash(this.password, 10);
	next();
});

// Export schema
module.exports = mongoose.model('userSchema', userSchema, 'User');
