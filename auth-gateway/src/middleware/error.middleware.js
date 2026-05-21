/**
 * Middleware de gestion globale des erreurs
 * Doit être le DERNIER middleware enregistré dans Express
 */

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Log structuré (en prod, ces logs vont dans CloudWatch)
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "auth-gateway",
    error: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  }));

  return res.status(status).json({
    error: isProduction && status === 500
      ? "Erreur interne du serveur."
      : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
}

module.exports = { errorHandler };
