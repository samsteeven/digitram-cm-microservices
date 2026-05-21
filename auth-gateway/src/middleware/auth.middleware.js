/**
 * Middleware d'authentification JWT + contrôle des rôles
 * Utilisé par : Auth Gateway (routes protégées /api/*)
 *
 * Rôles DIGITRANS-CM :
 *   - admin        : accès total
 *   - manager      : lecture/écriture sur tous les modules
 *   - agent_terrain : accès limité supply chain + crm (lecture)
 *   - comptable    : accès ERP uniquement
 *   - analyste     : accès BI + lecture sur les autres
 */

const jwt = require("jsonwebtoken");
const { getRedisClient } = require("../utils/redis.client");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET manquant dans les variables d'environnement");

/**
 * Vérifie le token JWT dans le header Authorization
 * Vérifie aussi que le token n'est pas dans la blacklist Redis (logout)
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token d'authentification manquant." });
    }

    const token = authHeader.split(" ")[1];

    // Vérification blacklist Redis (tokens révoqués après logout)
    const redis = getRedisClient();
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: "Token révoqué. Veuillez vous reconnecter." });
    }

    // Vérification signature + expiration
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attacher le payload à la requête pour les middlewares suivants
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      token
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expiré. Veuillez vous reconnecter." });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Token invalide." });
    }
    next(err);
  }
}

/**
 * Factory : crée un middleware qui vérifie que l'utilisateur a l'un des rôles autorisés
 * Usage : router.get("/...", verifyToken, requireRole(["admin", "manager"]), handler)
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Non authentifié." });
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

module.exports = { verifyToken, requireRole };
