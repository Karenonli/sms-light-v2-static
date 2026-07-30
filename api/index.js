// Vercel Serverless entry point
// Просто реэкспортирует Express-приложение из server.js
const app = require('../server');
module.exports = app;
