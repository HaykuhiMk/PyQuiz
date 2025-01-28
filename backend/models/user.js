const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});


userSchema.methods.isValidPassword = async function (password) {
    return bcrypt.compare(password, this.password); 
};

const User = mongoose.model('User', userSchema);

module.exports = User;
