/**
 * Worker de synchronisation Offline-First — Supply Chain Service
 *
 * Fonctionnement :
 *  1. Les agents terrain enregistrent leurs actions dans Redis (queue offline)
 *     lorsqu'ils n'ont pas de connexion Internet.
 *  2. Ce worker tourne en arrière-plan et dépile la queue Redis
 *     pour persister les données dans PostgreSQL.
 *  3. Le dédoublonnage se fait via offline_id (ID généré côté client).
 *
 * Queue Redis : LPUSH "sync:queue" <payload_json>
 *              RPOP  "sync:queue"  ← le worker consomme ici
 */

const { getDb } = require("../../config/db");
const { getRedis } = require("../../config/redis");
const { recordCheckpointOnChain, updateShipmentStatusOnChain } = require("../blockchain/fabric.client");

const QUEUE_KEY = "sync:queue";
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MS || "30000");
const MAX_RETRIES = 3;

/**
 * Traite un seul élément de la queue
 */
async function processQueueItem(item) {
  const db = getDb();
  const { operation, entity_type, payload, offline_id } = item;

  // Dédoublonnage : vérifier si cet offline_id a déjà été traité
  if (offline_id) {
    const existing = await db.query(
      "SELECT id FROM checkpoints WHERE offline_id = $1",
      [offline_id]
    );
    if (existing.rowCount > 0) {
      console.log(`[SYNC] Doublon ignoré — offline_id: ${offline_id}`);
      return { skipped: true };
    }
  }

  switch (entity_type) {
    case "checkpoint": {
      if (operation === "INSERT") {
        await db.query(
          `INSERT INTO checkpoints (id, shipment_id, location, latitude, longitude, status, notes, recorded_at, synced, offline_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, $8)
           ON CONFLICT (offline_id) DO NOTHING`,
          [payload.shipment_id, payload.location, payload.latitude, payload.longitude,
           payload.status, payload.notes, payload.recorded_at || new Date(), offline_id]
        );
      }
      if (offline_id) {
        await recordCheckpointOnChain({
          id: offline_id, shipment_id: payload.shipment_id,
          location: payload.location, status: payload.status,
          notes: payload.notes, latitude: payload.latitude, longitude: payload.longitude
        });
      }
      break;
    }

    case "shipment_status": {
      if (operation === "UPDATE") {
        await db.query(
          "UPDATE shipments SET status = $1, updated_at = NOW(), synced = true WHERE id = $2",
          [payload.status, payload.shipment_id]
        );
        await updateShipmentStatusOnChain(payload.shipment_id, payload.status);
      }
      break;
    }

    default:
      console.warn(`[SYNC] Type d'entité inconnu : ${entity_type}`);
  }

  // Persister dans la table sync_queue pour audit
  await db.query(
    `INSERT INTO sync_queue (entity_type, operation, payload, status, created_at)
     VALUES ($1, $2, $3, 'done', NOW())`,
    [entity_type, operation, JSON.stringify(payload)]
  );

  return { success: true };
}

/**
 * Dépile et traite tous les éléments en attente dans Redis
 */
async function flushQueue() {
  const redis = getRedis();
  let processed = 0;
  let errors = 0;

  while (true) {
    const raw = await redis.rPop(QUEUE_KEY);
    if (!raw) break; // queue vide

    try {
      const item = JSON.parse(raw);
      const result = await processQueueItem(item);
      if (!result.skipped) processed++;
    } catch (err) {
      errors++;
      console.error("[SYNC] Erreur traitement item :", err.message);

      // Remettre dans la queue si pas trop de retries
      try {
        const item = JSON.parse(raw);
        item._retries = (item._retries || 0) + 1;
        if (item._retries < MAX_RETRIES) {
          await redis.lPush(`${QUEUE_KEY}:retry`, JSON.stringify(item));
        } else {
          await redis.lPush(`${QUEUE_KEY}:dead-letter`, raw);
          console.error("[SYNC] Item en dead-letter après", MAX_RETRIES, "tentatives");
        }
      } catch (e) {
        console.error("[SYNC] Impossible de remettre l'item en queue :", e.message);
      }
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[SYNC] Flush terminé — traités: ${processed}, erreurs: ${errors}`);
  }
}

/**
 * Démarre le worker (boucle infinie avec intervalle configurable)
 */
function startSyncWorker() {
  console.log(`[SYNC] Worker démarré — intervalle: ${SYNC_INTERVAL}ms`);

  // Premier flush immédiat au démarrage
  flushQueue().catch(err => console.error("[SYNC] Erreur flush initial :", err.message));

  // Puis flush périodique
  setInterval(() => {
    flushQueue().catch(err => console.error("[SYNC] Erreur flush périodique :", err.message));
  }, SYNC_INTERVAL);
}

module.exports = { startSyncWorker, flushQueue, processQueueItem };
