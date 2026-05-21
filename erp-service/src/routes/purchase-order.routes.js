/**
 * Routes Approvisionnements — ERP Service
 * Gestion des bons de commande d'AGROCAM S.A.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");

// ─── Validation Joi ─────────────────────────────────────────────────
const purchaseOrderSchema = Joi.object({
  order_ref: Joi.string().required(),
  supplier_name: Joi.string().required(),
  total_amount: Joi.number().positive().required(),
  currency: Joi.string().default("XAF"),
  order_date: Joi.date().iso().required(),
  delivery_date: Joi.date().iso().optional().allow(null)
});

/**
 * @swagger
 * /purchase-orders:
 *   get:
 *     summary: Liste paginée des bons de commande
 *     tags: [ERP - Approvisionnements]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, delivered, cancelled] }
 *       - in: query
 *         name: supplier_name
 *         schema: { type: string }
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée des commandes
 */
router.get("/", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const { status, supplier_name, date_from, date_to, page = 1, limit = 20 } = req.query;
    const limitVal = parseInt(limit);
    const offsetVal = (parseInt(page) - 1) * limitVal;
    const db = getDb();

    let queryConditions = "";
    const params = [];

    if (status) {
      params.push(status);
      queryConditions += ` AND status = $${params.length}`;
    }
    if (supplier_name) {
      params.push(`%${supplier_name}%`);
      queryConditions += ` AND supplier_name ILIKE $${params.length}`;
    }
    if (date_from) {
      params.push(date_from);
      queryConditions += ` AND order_date >= $${params.length}`;
    }
    if (date_to) {
      params.push(date_to);
      queryConditions += ` AND order_date <= $${params.length}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM purchase_orders WHERE 1=1${queryConditions}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Data query
    const dataParams = [...params];
    dataParams.push(limitVal);
    const limitIndex = dataParams.length;
    dataParams.push(offsetVal);
    const offsetIndex = dataParams.length;

    const dataQuery = `SELECT * FROM purchase_orders WHERE 1=1${queryConditions} ORDER BY order_date DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
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
 * /purchase-orders/{id}:
 *   get:
 *     summary: Détail d'un bon de commande
 *     tags: [ERP - Approvisionnements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Détail de la commande
 *       404:
 *         description: Non trouvée
 */
router.get("/:id", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query("SELECT * FROM purchase_orders WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Bon de commande non trouvé." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /purchase-orders:
 *   post:
 *     summary: Créer un bon de commande
 *     tags: [ERP - Approvisionnements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_ref, supplier_name, total_amount, order_date]
 *             properties:
 *               order_ref: { type: string }
 *               supplier_name: { type: string }
 *               total_amount: { type: number, minimum: 0 }
 *               currency: { type: string, default: XAF }
 *               order_date: { type: string, format: date }
 *               delivery_date: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Commande créée
 *       409:
 *         description: Référence de commande existante
 */
router.post("/", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const { error, value } = purchaseOrderSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();
    const createdBy = req.user?.id || null;

    const result = await db.query(
      `INSERT INTO purchase_orders (id, order_ref, supplier_name, total_amount, currency, status, order_date, delivery_date, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NOW(), NOW()) RETURNING *`,
      [id, value.order_ref, value.supplier_name, value.total_amount, value.currency || "XAF", value.order_date, value.delivery_date || null, createdBy]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Référence de bon de commande déjà existante." });
    }
    next(err);
  }
});

/**
 * @swagger
 * /purchase-orders/{id}/status:
 *   patch:
 *     summary: Changer le statut d'un bon de commande
 *     tags: [ERP - Approvisionnements]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [approved, delivered, cancelled] }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 *       422:
 *         description: Transition de statut invalide
 */
router.patch("/:id/status", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const db = getDb();
    const currentOrder = await db.query("SELECT status FROM purchase_orders WHERE id = $1", [req.params.id]);
    if (currentOrder.rowCount === 0) {
      return res.status(404).json({ error: "Bon de commande non trouvé." });
    }

    const currentStatus = currentOrder.rows[0].status;
    const newStatus = req.body.status;

    if (!["approved", "delivered", "cancelled"].includes(newStatus)) {
      return res.status(400).json({ error: "Statut de destination invalide." });
    }

    // Rules validation: pending -> approved/cancelled, approved -> delivered/cancelled
    let allowed = false;
    if (currentStatus === "pending") {
      if (newStatus === "approved" || newStatus === "cancelled") allowed = true;
    } else if (currentStatus === "approved") {
      if (newStatus === "delivered" || newStatus === "cancelled") allowed = true;
    }

    if (!allowed) {
      return res.status(422).json({
        error: `Transition de statut invalide de '${currentStatus}' vers '${newStatus}'.`
      });
    }

    const result = await db.query(
      "UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [newStatus, req.params.id]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /purchase-orders/{id}:
 *   delete:
 *     summary: Annuler un bon de commande (soft delete)
 *     tags: [ERP - Approvisionnements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Commande annulée
 */
router.delete("/:id", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query(
      "UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Bon de commande non trouvé." });
    }
    return res.json({ message: "Bon de commande annulé.", id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
