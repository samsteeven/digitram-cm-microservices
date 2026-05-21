const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");
const { recordShipmentOnChain, updateShipmentStatusOnChain, queryShipmentHistory, isConnected } = require("../blockchain/fabric.client");

const shipmentSchema = Joi.object({
  shipment_ref: Joi.string().max(30).required(),
  origin: Joi.string().max(200).required(),
  destination: Joi.string().max(200).required(),
  product_type: Joi.string().max(100).required(),
  quantity: Joi.number().positive().allow(null),
  unit: Joi.string().max(30).allow("", null),
  carrier: Joi.string().max(200).allow("", null),
  departure_date: Joi.date().iso().allow(null),
  expected_arrival: Joi.date().iso().allow(null)
});

/**
 * @swagger
 * /shipments:
 *   get:
 *     summary: Liste paginée des expéditions
 *     tags: [Supply Chain - Expéditions]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, in_transit, at_checkpoint, delivered, delayed, lost] }
 *       - in: query
 *         name: origin
 *         schema: { type: string }
 *       - in: query
 *         name: destination
 *         schema: { type: string }
 *       - in: query
 *         name: synced
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée des expéditions
 */
router.get("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { status, origin, destination, synced, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();

    let query = "SELECT * FROM shipments WHERE 1=1";
    const params = [];
    const countParams = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
      countParams.push(status);
    }
    if (origin) {
      params.push(`%${origin}%`);
      query += ` AND origin ILIKE $${params.length}`;
      countParams.push(`%${origin}%`);
    }
    if (destination) {
      params.push(`%${destination}%`);
      query += ` AND destination ILIKE $${params.length}`;
      countParams.push(`%${destination}%`);
    }
    if (synced !== undefined) {
      params.push(synced === "true");
      query += ` AND synced = $${params.length}`;
      countParams.push(synced === "true");
    }

    params.push(parseInt(limit));
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    let countQuery = "SELECT COUNT(*) FROM shipments WHERE 1=1";
    const clauses = [];
    if (status) clauses.push("status = $" + (clauses.length + 1));
    if (origin) clauses.push("origin ILIKE $" + (clauses.length + 1));
    if (destination) clauses.push("destination ILIKE $" + (clauses.length + 1));
    if (synced !== undefined) clauses.push("synced = $" + (clauses.length + 1));
    if (clauses.length > 0) countQuery += " AND " + clauses.join(" AND ");

    const countResult = await db.query(countQuery, countParams);

    return res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /shipments/{id}:
 *   get:
 *     summary: Détail d'une expédition avec ses points de contrôle
 *     tags: [Supply Chain - Expéditions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Expédition avec checkpoints
 *       404:
 *         description: Expédition non trouvée
 */
router.get("/:id", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const db = getDb();
    const shipment = await db.query("SELECT * FROM shipments WHERE id = $1", [req.params.id]);
    if (shipment.rowCount === 0) {
      return res.status(404).json({ error: "Expédition non trouvée." });
    }

    const checkpoints = await db.query(
      "SELECT * FROM checkpoints WHERE shipment_id = $1 ORDER BY recorded_at ASC",
      [req.params.id]
    );

    const blockchain = isConnected() ? await queryShipmentHistory(req.params.id) : [];

    return res.json({
      ...shipment.rows[0],
      checkpoints: checkpoints.rows,
      blockchain: { onChain: isConnected(), history: blockchain }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /shipments:
 *   post:
 *     summary: Créer une expédition
 *     tags: [Supply Chain - Expéditions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipment_ref, origin, destination, product_type]
 *             properties:
 *               shipment_ref: { type: string }
 *               origin: { type: string }
 *               destination: { type: string }
 *               product_type: { type: string }
 *               quantity: { type: number }
 *               unit: { type: string }
 *               carrier: { type: string }
 *               departure_date: { type: string, format: date-time }
 *               expected_arrival: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Expédition créée
 */
router.post("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { error, value } = shipmentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO shipments (id, shipment_ref, origin, destination, product_type, quantity, unit, carrier, departure_date, expected_arrival)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, value.shipment_ref, value.origin, value.destination, value.product_type,
       value.quantity, value.unit, value.carrier, value.departure_date, value.expected_arrival]
    );

    const shipment = result.rows[0];
    const blockchain = await recordShipmentOnChain(shipment);

    return res.status(201).json({ ...shipment, blockchain });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Une expédition avec cette référence existe déjà." });
    }
    next(err);
  }
});

/**
 * @swagger
 * /shipments/{id}/status:
 *   patch:
 *     summary: Mettre à jour le statut d'une expédition
 *     tags: [Supply Chain - Expéditions]
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
 *               status: { type: string, enum: [pending, in_transit, at_checkpoint, delivered, delayed, lost] }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.patch("/:id/status", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { status: newStatus } = req.body;
    if (!newStatus) return res.status(400).json({ error: "Le champ status est requis." });

    const validStatuses = ["pending", "in_transit", "at_checkpoint", "delivered", "delayed", "lost"];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: `Statut invalide.` });
    }

    const db = getDb();
    const result = await db.query(
      "UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [newStatus, req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Expédition non trouvée." });

    const shipment = result.rows[0];
    const blockchain = await updateShipmentStatusOnChain(shipment.id, newStatus);

    return res.json({ ...shipment, blockchain });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /shipments/pending-sync:
 *   get:
 *     summary: Expéditions non synchronisées (dashboard offline)
 *     tags: [Supply Chain - Expéditions]
 *     responses:
 *       200:
 *         description: Liste des expéditions en attente de sync
 */
router.get("/pending-sync", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT * FROM shipments WHERE synced = false ORDER BY updated_at DESC"
    );
    return res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
