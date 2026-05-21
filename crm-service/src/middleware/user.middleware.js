function extractUserFromHeaders(req, res, next) {
  req.user = {
    id: req.headers["x-user-id"] || null,
    role: req.headers["x-user-role"] || null,
    email: req.headers["x-user-email"] || null
  };
  next();
}
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(401).json({ error: "Non authentifié." });
    if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: "Accès refusé.", required: allowedRoles, current: req.user.role });
    next();
  };
}
module.exports = { extractUserFromHeaders, requireRole };
