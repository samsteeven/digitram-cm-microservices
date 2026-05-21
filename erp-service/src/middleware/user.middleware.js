/**
 * Middleware utilisateur — Services en aval du Gateway
 * Lit les headers X-User-* injectés par l'Auth Gateway
 * et expose req.user pour les controllers/routes
 */

function extractUserFromHeaders(req, res, next) {
  req.user = {
    id: req.headers["x-user-id"] || null,
    role: req.headers["x-user-role"] || null,
    email: req.headers["x-user-email"] || null
  };
  next();
}

/**
 * Vérifie que l'utilisateur a l'un des rôles autorisés.
 * Les services appelés directement (hors gateway, ex: tests) peuvent passer un header Authorization.
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: "Non authentifié — header X-User-Role manquant." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Accès refusé.",
        required: allowedRoles,
        current: req.user.role
      });
    }
    next();
  };
}

module.exports = { extractUserFromHeaders, requireRole };
