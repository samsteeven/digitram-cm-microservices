const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");
const { recordCheckpointOnChain, updateShipmentStatusOnChain } = require("../blockchain/fabric.client");

const checkpointSchema = Joi.object({
  shipment_id: Joi.string().uuid().required(),
  location: Joi.string().max(200).required(),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  status: Joi.string().max(50).required(),
  notes: Joi.string().max(500).allow("", null)
});

/**
 * @swagger
 * /checkpoints:
 *   get:
 *     summary: Points de contrôle d'une expédition
 *     tags: [Supply Chain - Checkpoints]
 *     parameters:
 *       - in: query
 *         name: shipment_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID de l'expédition
 *     responses:
 *       200:
 *         description: Liste des checkpoints
 */
router.get("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { shipment_id } = req.query;
    if (!shipment_id) {
      return res.status(400).json({ error: "Le paramètre shipment_id est requis." });
    }

    const db = getDb();
    const result = await db.query(
      "SELECT * FROM checkpoints WHERE shipment_id = $1 ORDER BY recorded_at ASC",
      [shipment_id]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /checkpoints:
 *   post:
 *     summary: Enregistrer un point de contrôle
 *     tags: [Supply Chain - Checkpoints]
 *     description: Met à jour le statut de l'expédition parente si nécessaire
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipment_id, location, status]
 *             properties:
 *               shipment_id: { type: string, format: uuid }
 *               location: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               status: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Checkpoint créé
 */
router.post("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { error, value } = checkpointSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();

    await db.query("BEGIN");

    try {
      const shipmentCheck = await db.query(
        "SELECT id, status FROM shipments WHERE id = $1",
        [value.shipment_id]
      );
      if (shipmentCheck.rowCount === 0) {
        await db.query("ROLLBACK");
        return res.status(404).json({ error: "Expédition non trouvée." });
      }

      const result = await db.query(
        `INSERT INTO checkpoints (id, shipment_id, location, latitude, longitude, status, notes, synced)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING *`,
        [id, value.shipment_id, value.location, value.latitude, value.longitude,
         value.status, value.notes]
      );

      const currentShipmentStatus = shipmentCheck.rows[0].status;
      if (currentShipmentStatus === "pending" || currentShipmentStatus === "in_transit") {
        const newStatus = value.status === "delivered" ? "delivered" : "at_checkpoint";
        if (newStatus !== currentShipmentStatus) {
          await db.query(
            "UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2",
            [newStatus, value.shipment_id]
          );
        }
      }

      await db.query("COMMIT");

      const cp = result.rows[0];
      const blockchain = await recordCheckpointOnChain(cp);

      if (value.status === "delivered") {
        await updateShipmentStatusOnChain(value.shipment_id, "delivered");
      }

      return res.status(201).json({ ...cp, blockchain });
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
