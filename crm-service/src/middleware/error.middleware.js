function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: err.message, path: req.path, method: req.method }));
  res.status(status).json({ error: process.env.NODE_ENV === "production" && status === 500 ? "Erreur interne." : err.message });
}
module.exports = { errorHandler };
