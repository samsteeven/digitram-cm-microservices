function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  console.error({ timestamp: new Date().toISOString(), error: err.message, path: req.path });
  return res.status(status).json({ error: process.env.NODE_ENV === "production" && status === 500 ? "Erreur interne." : err.message });
}
module.exports = { errorHandler };
