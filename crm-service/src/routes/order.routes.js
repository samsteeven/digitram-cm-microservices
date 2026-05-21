/**
 * Routes Commandes — CRM Service
 * Gestion des commandes et des statistiques restaurants d'AGROCAM S.A.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { getRedis } = require("../../config/redis");
const { requireRole } = require("../middleware/user.middleware");

// ─── Validation Joi ─────────────────────────────────────────────────
const orderItemSchema = Joi.object({
  product_name: Joi.string().required(),
  quantity: Joi.number().integer().positive().required(),
  unit_price: Joi.number().positive().required()
});

const orderCreateSchema = Joi.object({
  customer_id: Joi.string().uuid().optional().allow(null),
  restaurant: Joi.string().required(),
  order_type: Joi.string().valid("dine-in", "takeaway", "delivery").required(),
  notes: Joi.string().optional().allow("").allow(null),
  items: Joi.array().min(1).items(orderItemSchema).required()
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Liste paginée des commandes
 *     tags: [CRM - Commandes]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: restaurant
 *         schema: { type: string }
 *       - in: query
 *         name: order_type
 *         schema: { type: string, enum: [dine-in, takeaway, delivery] }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Date de commande (YYYY-MM-DD)
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
router.get("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const { status, restaurant, order_type, date, page = 1, limit = 20 } = req.query;
    const limitVal = parseInt(limit);
    const offsetVal = (parseInt(page) - 1) * limitVal;
    const db = getDb();

    let queryConditions = "";
    const params = [];

    if (status) {
      params.push(status);
      queryConditions += ` AND o.status = $${params.length}`;
    }
    if (restaurant) {
      params.push(restaurant);
      queryConditions += ` AND o.restaurant = $${params.length}`;
    }
    if (order_type) {
      params.push(order_type);
      queryConditions += ` AND o.order_type = $${params.length}`;
    }
    if (date) {
      params.push(date);
      queryConditions += ` AND o.ordered_at::date = $${params.length}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM orders o WHERE 1=1${queryConditions}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Data query
    const dataParams = [...params];
    dataParams.push(limitVal);
    const limitIndex = dataParams.length;
    dataParams.push(offsetVal);
    const offsetIndex = dataParams.length;

    const dataQuery = `
      SELECT o.*, COUNT(oi.id)::int as items_count 
      FROM orders o 
      LEFT JOIN order_items oi ON oi.order_id = o.id 
      WHERE 1=1${queryConditions} 
      GROUP BY o.id 
      ORDER BY o.ordered_at DESC 
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;
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
 * /orders/stats/by-restaurant:
 *   get:
 *     summary: Statistiques par restaurant (avec cache Redis de 10 min)
 *     tags: [CRM - Commandes]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Statistiques des restaurants
 */
router.get("/stats/by-restaurant", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || 30);
    const db = getDb();

    const dateStr = new Date().toISOString().split("T")[0];
    const cacheKey = `crm:stats:restaurants:${days}:${dateStr}`;

    let cached = null;
    try {
      const redis = getRedis();
      cached = await redis.get(cacheKey);
    } catch (redisErr) {
      console.error("Redis cache get error:", redisErr.message);
    }

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const query = `
      SELECT restaurant,
        COUNT(*)::int as total_orders,
        COUNT(*) FILTER (WHERE status != 'cancelled')::int as completed_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0)::float as revenue,
        COALESCE(AVG(total_amount) FILTER (WHERE status = 'delivered'), 0)::float as avg_basket,
        MAX(ordered_at) as last_order
      FROM orders
      WHERE ordered_at >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY restaurant
      ORDER BY revenue DESC NULLS LAST
    `;
    const result = await db.query(query, [days]);
    const stats = result.rows;

    try {
      const redis = getRedis();
      await redis.set(cacheKey, JSON.stringify(stats), { EX: 600 });
    } catch (redisErr) {
      console.error("Redis cache set error:", redisErr.message);
    }

    return res.json(stats);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Détail d'une commande avec ses items
 *     tags: [CRM - Commandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Détail complet de la commande
 *       404:
 *         description: Commande non trouvée
 */
router.get("/:id", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT o.*, COALESCE(json_agg(oi.*) FILTER (WHERE oi.id IS NOT NULL), '[]') as items 
       FROM orders o 
       LEFT JOIN order_items oi ON oi.order_id = o.id 
       WHERE o.id = $1 
       GROUP BY o.id`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Commande non trouvée." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Créer une nouvelle commande (avec transaction)
 *     tags: [CRM - Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [restaurant, order_type, items]
 *             properties:
 *               customer_id: { type: string, format: uuid }
 *               restaurant: { type: string }
 *               order_type: { type: string, enum: [dine-in, takeaway, delivery] }
 *               notes: { type: string }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [product_name, quantity, unit_price]
 *                   properties:
 *                     product_name: { type: string }
 *                     quantity: { type: integer, minimum: 1 }
 *                     unit_price: { type: number, minimum: 0 }
 *     responses:
 *       201:
 *         description: Commande créée
 */
router.post("/", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  const pool = getDb();
  const client = await pool.connect();

  try {
    const { error, value } = orderCreateSchema.validate(req.body);
    if (error) {
      client.release();
      return res.status(400).json({ error: error.details[0].message });
    }

    await client.query("BEGIN");

    // 1. Calculer total_amount
    let totalAmount = 0;
    for (const item of value.items) {
      totalAmount += item.quantity * item.unit_price;
    }

    // 2. Générer order_ref
    const orderRef = `ORD-${Date.now()}`;
    const orderId = uuidv4();

    // 3. INSERT INTO orders
    const insertOrderQuery = `
      INSERT INTO orders (id, order_ref, customer_id, restaurant, total_amount, status, order_type, notes, ordered_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW()) RETURNING *
    `;
    const orderResult = await client.query(insertOrderQuery, [
      orderId, orderRef, value.customer_id || null, value.restaurant, totalAmount, value.order_type, value.notes || null
    ]);

    // 4. INSERT INTO order_items (batch)
    const insertedItems = [];
    for (const item of value.items) {
      const itemId = uuidv4();
      const insertItemQuery = `
        INSERT INTO order_items (id, order_id, product_name, quantity, unit_price)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `;
      const itemResult = await client.query(insertItemQuery, [
        itemId, orderId, item.product_name, item.quantity, item.unit_price
      ]);
      insertedItems.push(itemResult.rows[0]);
    }

    // 5. Si customer_id fourni → mise à jour des points fidélité (1 point par 100 XAF, arrondi)
    // Sécurisé avec Pessimistic Locking FOR UPDATE pour éviter les race conditions
    if (value.customer_id) {
      const points = Math.round(totalAmount / 100);
      if (points > 0) {
        const customerResult = await client.query(
          "SELECT loyalty_points, segment FROM customers WHERE id = $1 FOR UPDATE",
          [value.customer_id]
        );

        if (customerResult.rowCount > 0) {
          const currentPoints = parseInt(customerResult.rows[0].loyalty_points) || 0;
          const currentSegment = customerResult.rows[0].segment;
          const newPoints = currentPoints + points;

          let newSegment = currentSegment;
          if (newPoints > 10000) {
            newSegment = "vip";
          } else if (newPoints >= 5000) {
            newSegment = "premium";
          } else {
            newSegment = "standard";
          }

          await client.query(
            "UPDATE customers SET loyalty_points = $1, segment = $2, updated_at = NOW() WHERE id = $3",
            [newPoints, newSegment, value.customer_id]
          );
        }
      }
    }

    await client.query("COMMIT");
    client.release();

    const completeOrder = {
      ...orderResult.rows[0],
      items: insertedItems
    };

    return res.status(201).json(completeOrder);
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    next(err);
  }
});

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Changer le statut d'une commande
 *     tags: [CRM - Commandes]
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
 *               status: { type: string, enum: [confirmed, cancelled, preparing, ready, delivered] }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 *       422:
 *         description: Transition de statut invalide
 */
router.patch("/:id/status", requireRole(["admin", "manager", "agent_terrain"]), async (req, res, next) => {
  try {
    const db = getDb();
    const orderResult = await db.query("SELECT status FROM orders WHERE id = $1", [req.params.id]);
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: "Commande non trouvée." });
    }

    const current = orderResult.rows[0].status;
    const attempted = req.body.status;

    if (!["confirmed", "cancelled", "preparing", "ready", "delivered"].includes(attempted)) {
      return res.status(400).json({ error: "Statut de destination invalide." });
    }

    // Transitions autorisées :
    // pending → confirmed | cancelled
    // confirmed → preparing | cancelled
    // preparing → ready
    // ready → delivered
    // delivered → (terminal)
    // cancelled → (terminal)
    const transitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["ready"],
      ready: ["delivered"]
    };

    const allowed = transitions[current] || [];
    if (!allowed.includes(attempted)) {
      return res.status(422).json({
        error: "Transition de statut invalide.",
        current,
        attempted,
        allowed
      });
    }

    const updateResult = await db.query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [attempted, req.params.id]
    );

    return res.json(updateResult.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
