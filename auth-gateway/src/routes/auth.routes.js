/**
 * Routes d'authentification — Auth Gateway
 * POST /auth/login       → login avec email/password → retourne JWT + refresh token
 * POST /auth/refresh     → renouvelle le JWT avec un refresh token valide
 * POST /auth/logout      → révoque le token courant (blacklist Redis)
 * GET  /auth/me          → profil de l'utilisateur connecté
 */

const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getRedisClient } = require("../utils/redis.client");
const { verifyToken } = require("../middleware/auth.middleware");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";

// ─── Schémas de validation ──────────────────────────────────────────
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

// ─── Utilisateurs de démo (EN PROD → base de données) ───────────────
// TODO : remplacer par une vraie requête BDD avec pool pg
const DEMO_USERS = [
  {
    id: "user-001",
    email: "admin@agrocam.cm",
    name: "Admin AGROCAM",
    role: "admin",
    // bcrypt hash de "Admin@2026!"
    passwordHash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"
  },
  {
    id: "user-002",
    email: "manager@agrocam.cm",
    name: "Henri-Claude MOUKAM",
    role: "manager",
    passwordHash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"
  },
  {
    id: "user-003",
    email: "agent@agrocam.cm",
    name: "Agent Terrain Douala",
    role: "agent_terrain",
    passwordHash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"
  }
];

// ─── POST /auth/login ───────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Trouver l'utilisateur (en prod : SELECT depuis la BDD)
    const user = DEMO_USERS.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }

    // Générer le JWT
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Générer le refresh token et le stocker dans Redis
    const refreshToken = uuidv4();
    const redis = getRedisClient();
    await redis.setEx(
      `refresh:${refreshToken}`,
      7 * 24 * 3600, // 7 jours en secondes
      JSON.stringify({ userId: user.id, email: user.email, role: user.role })
    );

    return res.status(200).json({
      message: "Connexion réussie.",
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: JWT_EXPIRES_IN,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ─────────────────────────────────────────────
router.post("/refresh", async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: "refresh_token manquant." });
    }

    const redis = getRedisClient();
    const stored = await redis.get(`refresh:${refresh_token}`);
    if (!stored) {
      return res.status(401).json({ error: "Refresh token invalide ou expiré." });
    }

    const userData = JSON.parse(stored);
    const newAccessToken = jwt.sign(
      { sub: userData.userId, email: userData.email, role: userData.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: JWT_EXPIRES_IN
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ──────────────────────────────────────────────
router.post("/logout", verifyToken, async (req, res, next) => {
  try {
    const redis = getRedisClient();
    const token = req.user.token;

    // Décoder pour récupérer l'expiration restante
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      await redis.setEx(`blacklist:${token}`, ttl, "revoked");
    }

    return res.status(200).json({ message: "Déconnexion réussie." });
  } catch (err) {
    next(err);
  }
});

// ─── GET /auth/me ───────────────────────────────────────────────────
router.get("/me", verifyToken, (req, res) => {
  return res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role
  });
});

module.exports = router;
