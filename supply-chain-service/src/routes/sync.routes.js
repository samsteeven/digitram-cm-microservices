/**
 * Routes de synchronisation offline-first — Supply Chain Service
 * Permet aux agents terrain de pousser leurs données accumulées hors ligne
 */

const router = require("express").Router();
const Joi = require("joi");
const { getRedis } = require("../../config/redis");
const { flushQueue } = require("../sync/sync.worker");

const QUEUE_KEY = "sync:queue";

const syncItemSchema = Joi.object({
  operation: Joi.string().valid("INSERT", "UPDATE", "DELETE").required(),
  entity_type: Joi.string().valid("checkpoint", "shipment_status").required(),
  offline_id: Joi.string().max(50).required(),
  payload: Joi.object().required(),
  recorded_at: Joi.date().iso()
});

/**
 * @swagger
 * /sync/push:
 *   post:
 *     summary: Pousser des données collectées hors ligne
 *     tags: [Supply Chain - Sync Offline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 description: Liste des opérations à synchroniser
 *     responses:
 *       202:
 *         description: Données acceptées pour synchronisation asynchrone
 */
router.post("/push", async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items doit être un tableau non vide." });
    }

    const redis = getRedis();
    const results = { accepted: 0, rejected: 0, errors: [] };

    for (const item of items) {
      const { error } = syncItemSchema.validate(item);
      if (error) {
        results.rejected++;
        results.errors.push({ item, error: error.details[0].message });
        continue;
      }

      // Enqueue dans Redis pour traitement asynchrone
      item._queued_at = new Date().toISOString();
      item._user_id = req.user?.id;
      await redis.lPush(QUEUE_KEY, JSON.stringify(item));
      results.accepted++;
    }

    return res.status(202).json({
      message: "Données reçues et mises en queue.",
      ...results
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /sync/status:
 *   get:
 *     summary: Statut de la queue de synchronisation
 *     tags: [Supply Chain - Sync Offline]
 */
router.get("/status", async (req, res, next) => {
  try {
    const redis = getRedis();
    const [queueLen, retryLen, deadLetterLen] = await Promise.all([
      redis.lLen(QUEUE_KEY),
      redis.lLen(`${QUEUE_KEY}:retry`),
      redis.lLen(`${QUEUE_KEY}:dead-letter`)
    ]);

    return res.json({
      queue: { pending: queueLen, retry: retryLen, dead_letter: deadLetterLen },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /sync/flush:
 *   post:
 *     summary: Déclencher un flush manuel de la queue (admin)
 *     tags: [Supply Chain - Sync Offline]
 */
router.post("/flush", async (req, res, next) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Réservé aux administrateurs." });
    }
    await flushQueue();
    return res.json({ message: "Flush déclenché avec succès." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
