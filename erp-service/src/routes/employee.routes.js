/**
 * Routes Employés — ERP Service
 * Gestion complète du personnel AGROCAM S.A.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { getDb } = require("../../config/db");
const { requireRole } = require("../middleware/user.middleware");

// ─── Validation Joi ─────────────────────────────────────────────────
const employeeSchema = Joi.object({
  employee_id: Joi.string().max(20).required(),
  first_name: Joi.string().max(100).required(),
  last_name: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  department: Joi.string().max(100),
  position: Joi.string().max(100),
  salary: Joi.number().positive(),
  hire_date: Joi.date().iso(),
  status: Joi.string().valid("active", "inactive", "suspended").default("active")
});

/**
 * @swagger
 * /employees:
 *   get:
 *     summary: Liste tous les employés
 *     tags: [ERP - RH]
 *     parameters:
 *       - in: query
 *         name: department
 *         schema: { type: string }
 *         description: Filtrer par département
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, suspended] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Liste paginée des employés
 */
router.get("/", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const { department, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDb();

    let query = "SELECT * FROM employees WHERE 1=1";
    const params = [];

    if (department) {
      params.push(department);
      query += ` AND department = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY last_name, first_name LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    // Count total
    const countResult = await db.query(
      "SELECT COUNT(*) FROM employees WHERE 1=1" +
      (department ? " AND department = $1" : "") +
      (status ? ` AND status = $${department ? 2 : 1}` : ""),
      [department, status].filter(Boolean)
    );

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
 * /employees/{id}:
 *   get:
 *     summary: Détail d'un employé
 *     tags: [ERP - RH]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Données de l'employé
 *       404:
 *         description: Employé non trouvé
 */
router.get("/:id", requireRole(["admin", "manager", "comptable"]), async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query("SELECT * FROM employees WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Employé non trouvé." });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /employees:
 *   post:
 *     summary: Créer un employé
 *     tags: [ERP - RH]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Employee'
 *     responses:
 *       201:
 *         description: Employé créé
 */
router.post("/", requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const { error, value } = employeeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = getDb();
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO employees (id, employee_id, first_name, last_name, email, department, position, salary, hire_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, value.employee_id, value.first_name, value.last_name, value.email,
       value.department, value.position, value.salary, value.hire_date, value.status]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Un employé avec cet ID ou cet email existe déjà." });
    }
    next(err);
  }
});

/**
 * @swagger
 * /employees/{id}:
 *   patch:
 *     summary: Modifier partiellement un employé
 *     tags: [ERP - RH]
 */
router.patch("/:id", requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const db = getDb();
    const fields = [];
    const values = [];

    const allowed = ["first_name", "last_name", "email", "department", "position", "salary", "status"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        values.push(req.body[key]);
        fields.push(`${key} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour." });
    }

    values.push(new Date()); // updated_at
    fields.push(`updated_at = $${values.length}`);
    values.push(req.params.id);

    const result = await db.query(
      `UPDATE employees SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Employé non trouvé." });
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /employees/{id}:
 *   delete:
 *     summary: Désactiver un employé (soft delete)
 *     tags: [ERP - RH]
 */
router.delete("/:id", requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = getDb();
    // Soft delete : on passe le status à 'inactive' plutôt que de supprimer
    const result = await db.query(
      "UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Employé non trouvé." });
    return res.json({ message: "Employé désactivé.", id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
