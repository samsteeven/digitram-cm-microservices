/**
 * Routes Comptabilité — ERP Service
 * Gestion du grand livre et écritures comptables d'AGROCAM S.A.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");

// ─── Validation Joi ─────────────────────────────────────────────────
const accountingSchema = Joi.object({
  entry_ref: Joi.string().required(),
  entry_type: Joi.string().valid("debit", "credit", "adjustment").required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default("XAF"),
  description: Joi.string().allow("").optional(),
  entry_date: Joi.date().iso().required(),
  fiscal_year: Joi.number().integer().required()
});

/**
 * @swagger
 * /accounting:
 *   get:
 *     summary: Liste paginée des écritures comptables
 *     tags: [ERP - Comptabilité]
 *     parameters:
 *       - in: query
 *         name: entry_type
 *         schema: { type: string, enum: [debit, credit, adjustment] }
 *       - in: query
 *         name: fiscal_year
 *         schema: { type: integer }
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
 *         description: Liste paginée des écritures
 */
router.get("/", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const { entry_type, fiscal_year, date_from, date_to, page = 1, limit = 20 } = req.query;
    const limitVal = parseInt(limit);
    const offsetVal = (parseInt(page) - 1) * limitVal;
    const db = getDb();

    let queryConditions = "";
    const params = [];

    if (entry_type) {
      params.push(entry_type);
      queryConditions += ` AND entry_type = $${params.length}`;
    }
    if (fiscal_year) {
      params.push(parseInt(fiscal_year));
      queryConditions += ` AND fiscal_year = $${params.length}`;
    }
    if (date_from) {
      params.push(date_from);
      queryConditions += ` AND entry_date >= $${params.length}`;
    }
    if (date_to) {
      params.push(date_to);
      queryConditions += ` AND entry_date <= $${params.length}`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) FROM accounting_entries WHERE 1=1${queryConditions}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Data query
    const dataParams = [...params];
    dataParams.push(limitVal);
    const limitIndex = dataParams.length;
    dataParams.push(offsetVal);
    const offsetIndex = dataParams.length;

    const dataQuery = `SELECT * FROM accounting_entries WHERE 1=1${queryConditions} ORDER BY entry_date DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
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
 * /accounting/summary/{year}:
 *   get:
 *     summary: Résumé financier pour un exercice fiscal
 *     tags: [ERP - Comptabilité]
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Résumé financier de l'exercice
 */
router.get("/summary/:year", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const year = parseInt(req.params.year);
    const db = getDb();

    const result = await db.query(
      `SELECT entry_type, SUM(amount) as total, COUNT(*) as count 
       FROM accounting_entries 
       WHERE fiscal_year = $1 
       GROUP BY entry_type`,
      [year]
    );

    let totalDebit = 0;
    let totalCredit = 0;
    let totalCount = 0;

    result.rows.forEach(row => {
      const amount = parseFloat(row.total) || 0;
      const count = parseInt(row.count) || 0;
      totalCount += count;
      if (row.entry_type === "debit") {
        totalDebit = amount;
      } else if (row.entry_type === "credit") {
        totalCredit = amount;
      }
    });

    const balance = totalCredit - totalDebit;

    return res.json({
      year,
      total_debit: totalDebit,
      total_credit: totalCredit,
      balance,
      entries_count: totalCount
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /accounting/{id}:
 *   get:
 *     summary: Détail d'une écriture comptable
 *     tags: [ERP - Comptabilité]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Détail de l'écriture
 *       404:
 *         description: Non trouvée
 */
router.get("/:id", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query("SELECT * FROM accounting_entries WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Écriture comptable non trouvée." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /accounting:
 *   post:
 *     summary: Créer une écriture comptable
 *     tags: [ERP - Comptabilité]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entry_ref, entry_type, amount, entry_date, fiscal_year]
 *             properties:
 *               entry_ref: { type: string }
 *               entry_type: { type: string, enum: [debit, credit, adjustment] }
 *               amount: { type: number, minimum: 0 }
 *               currency: { type: string, default: XAF }
 *               description: { type: string }
 *               entry_date: { type: string, format: date }
 *               fiscal_year: { type: integer }
 *     responses:
 *       201:
 *         description: Écriture créée
 *       409:
 *         description: Référence d'écriture déjà existante
 */
router.post("/", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const { error, value } = accountingSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();
    const createdBy = req.user?.id || null;

    const result = await db.query(
      `INSERT INTO accounting_entries (id, entry_ref, entry_type, amount, currency, description, entry_date, fiscal_year, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [id, value.entry_ref, value.entry_type, value.amount, value.currency || "XAF", value.description || null, value.entry_date, value.fiscal_year, createdBy]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Référence d'écriture déjà existante (entry_ref en doublon)." });
    }
    next(err);
  }
});

module.exports = router;
