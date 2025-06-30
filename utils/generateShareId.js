// utils/generateShareId.js
const crypto = require('crypto');

module.exports = function generateShareId() {
    return crypto.randomBytes(8).toString('hex');
};