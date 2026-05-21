/**
 * Routes Clients — CRM Service
 * Gestion du portefeuille client et fidélité d'AGROCAM S.A.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");

// ─── Validation Joi ─────────────────────────────────────────────────
const customerSchema = Joi.object({
  customer_ref: Joi.string().max(20).required(),
  full_name: Joi.string().max(200).required(),
  email: Joi.string().email().optional().allow("").allow(null),
  phone: Joi.string().max(30).optional().allow("").allow(null),
  city: Joi.string().max(100).optional().allow("").allow(null),
  segment: Joi.string().valid("vip", "premium", "standard").default("standard")
});

const patchCustomerSchema = Joi.object({
  full_name: Joi.string().max(200).optional(),
  email: Joi.string().email().optional().allow("").allow(null),
  phone: Joi.string().max(30).optional().allow("").allow(null),
  city: Joi.string().max(100).optional().allow("").allow(null),
  segment: Joi.string().valid("vip", "premium", "standard").optional()
});

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: Liste paginée des clients
 *     tags: [CRM - Clients]
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: segment
 *         schema: { type: string, enum: [vip, premium, standard] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Recherche par nom complet ou email (ILIKE)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée des clients
 */
router.get("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { city, segment, search, page = 1, limit = 20 } = req.query;
    const limitVal = parseInt(limit);
    const offsetVal = (parseInt(page) - 1) * limitVal;
    const db = getDb();

    let queryConditions = "";
    const params = [];

    if (city) {
      params.push(city);
      queryConditions += ` AND city = $${params.length}`;
    }
    if (segment) {
      params.push(segment);
      queryConditions += ` AND segment = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      queryConditions += ` AND (full_name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM customers WHERE 1=1${queryConditions}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Data query
    const dataParams = [...params];
    dataParams.push(limitVal);
    const limitIndex = dataParams.length;
    dataParams.push(offsetVal);
    const offsetIndex = dataParams.length;

    const dataQuery = `SELECT * FROM customers WHERE 1=1${queryConditions} ORDER BY full_name LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
    const dataResult = await db.query(dataQuery, dataParams);

    return res.json({
      data: dataResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitVal,
        pages: Math.ceil(total / limitVal)
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Détail d'un client
 *     tags: [CRM - Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Détail du client
 *       404:
 *         description: Client non trouvé
 */
router.get("/:id", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Client non trouvé." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /customers/{id}/orders:
 *   get:
 *     summary: Liste des 50 dernières commandes d'un client
 *     tags: [CRM - Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Commandes du client
 *       404:
 *         description: Client non trouvé
 */
router.get("/:id/orders", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const customerId = req.params.id;
    const db = getDb();

    // Check if customer exists
    const customerCheck = await db.query("SELECT 1 FROM customers WHERE id = $1", [customerId]);
    if (customerCheck.rowCount === 0) {
      return res.status(404).json({ error: "Client non trouvé." });
    }

    const ordersResult = await db.query(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY ordered_at DESC LIMIT 50",
      [customerId]
    );
    const countResult = await db.query("SELECT COUNT(*) FROM orders WHERE customer_id = $1", [customerId]);

    return res.json({
      total: parseInt(countResult.rows[0].count),
      data: ordersResult.rows
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Créer un nouveau client
 *     tags: [CRM - Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_ref, full_name]
 *             properties:
 *               customer_ref: { type: string, maxLength: 20 }
 *               full_name: { type: string, maxLength: 200 }
 *               email: { type: string }
 *               phone: { type: string, maxLength: 30 }
 *               city: { type: string, maxLength: 100 }
 *               segment: { type: string, enum: [vip, premium, standard], default: standard }
 *     responses:
 *       201:
 *         description: Client créé
 *       409:
 *         description: Référence client déjà existante
 */
router.post("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { error, value } = customerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO customers (id, customer_ref, full_name, email, phone, city, loyalty_points, segment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW(), NOW()) RETURNING *`,
      [id, value.customer_ref, value.full_name, value.email || null, value.phone || null, value.city || null, value.segment]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Référence client déjà existante." });
    }
    next(err);
  }
});

/**
 * @swagger
 * /customers/{id}:
 *   patch:
 *     summary: Modifier un client
 *     tags: [CRM - Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               city: { type: string }
 *               segment: { type: string, enum: [vip, premium, standard] }
 *     responses:
 *       200:
 *         description: Client mis à jour
 *       404:
 *         description: Client non trouvé
 */
router.patch("/:id", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { error, value } = patchCustomerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const fields = [];
    const values = [];

    const allowed = ["full_name", "email", "phone", "city", "segment"];
    for (const key of allowed) {
      if (value[key] !== undefined) {
        values.push(value[key]);
        fields.push(`${key} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour." });
    }

    values.push(req.params.id);
    const idIndex = values.length;

    const result = await db.query(
      `UPDATE customers SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idIndex} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Client non trouvé." });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /customers/{id}/loyalty:
 *   post:
 *     summary: Ajouter des points de fidélité à un client
 *     tags: [CRM - Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [points]
 *             properties:
 *               points: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Points ajoutés et segment recalculé
 *       404:
 *         description: Client non trouvé
 */
router.post("/:id/loyalty", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const points = parseInt(req.body.points);
    if (isNaN(points) || points <= 0) {
      return res.status(400).json({ error: "Le champ points doit être un nombre positif." });
    }

    const db = getDb();
    const selectResult = await db.query("SELECT loyalty_points, segment FROM customers WHERE id = $1", [req.params.id]);
    if (selectResult.rowCount === 0) {
      return res.status(404).json({ error: "Client non trouvé." });
    }

    const currentPoints = parseInt(selectResult.rows[0].loyalty_points) || 0;
    const currentSegment = selectResult.rows[0].segment;
    const newPoints = currentPoints + points;

    let newSegment = currentSegment;
    if (newPoints > 10000) {
      newSegment = "vip";
    } else if (newPoints >= 5000) {
      newSegment = "premium";
    } else {
      newSegment = "standard";
    }

    await db.query(
      "UPDATE customers SET loyalty_points = $1, segment = $2, updated_at = NOW() WHERE id = $3",
      [newPoints, newSegment, req.params.id]
    );

    return res.json({
      customer_id: req.params.id,
      new_points: newPoints,
      segment: newSegment
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
