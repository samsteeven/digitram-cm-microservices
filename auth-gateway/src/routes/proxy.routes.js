/**
 * Routes proxy — Auth Gateway
 * Après vérification JWT, route les requêtes vers les microservices cibles.
 * Injecte l'identité de l'utilisateur dans les headers pour les services en aval.
 *
 * Mapping :
 *   /api/erp/*            → ERP_SERVICE_URL:3001
 *   /api/crm/*            → CRM_SERVICE_URL:3002
 *   /api/supply-chain/*   → SUPPLY_CHAIN_SERVICE_URL:3003
 *   /api/bi/*             → BI_SERVICE_URL:3004
 */

const router = require("express").Router();
const { createProxyMiddleware } = require("http-proxy-middleware");
const { requireRole } = require("../middleware/auth.middleware");

// ─── Helpers ────────────────────────────────────────────────────────
/**
 * Injecte les informations utilisateur dans les headers avant le proxy.
 * Les services en aval peuvent lire X-User-Id, X-User-Role, X-User-Email.
 */
function injectUserHeaders(req, res, next) {
  req.headers["x-user-id"] = req.user.id;
  req.headers["x-user-role"] = req.user.role;
  req.headers["x-user-email"] = req.user.email;
  next();
}

function buildProxy(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        console.error(`[PROXY ERROR] ${target}:`, err.message);
        res.status(502).json({
          error: "Service temporairement indisponible.",
          service: target
        });
      }
    }
  });
}

// ─── ERP Service (admin, manager, comptable) ──────────────────────
router.use(
  "/erp",
  requireRole(["admin", "manager", "comptable"]),
  injectUserHeaders,
  buildProxy(
    process.env.ERP_SERVICE_URL || "http://localhost:3001",
    { "^/api/erp": "" }
  )
);

// ─── CRM Service (admin, manager, agent_terrain) ──────────────────
router.use(
  "/crm",
  requireRole(["admin", "manager", "agent_terrain"]),
  injectUserHeaders,
  buildProxy(
    process.env.CRM_SERVICE_URL || "http://localhost:3002",
    { "^/api/crm": "" }
  )
);

// ─── Supply Chain Service (admin, manager, agent_terrain) ─────────
router.use(
  "/supply-chain",
  requireRole(["admin", "manager", "agent_terrain"]),
  injectUserHeaders,
  buildProxy(
    process.env.SUPPLY_CHAIN_SERVICE_URL || "http://localhost:3003",
    { "^/api/supply-chain": "" }
  )
);

// ─── BI Service (admin, manager, analyste) ────────────────────────
router.use(
  "/bi",
  requireRole(["admin", "manager", "analyste"]),
  injectUserHeaders,
  buildProxy(
    process.env.BI_SERVICE_URL || "http://localhost:3004",
    { "^/api/bi": "" }
  )
);

module.exports = router;
