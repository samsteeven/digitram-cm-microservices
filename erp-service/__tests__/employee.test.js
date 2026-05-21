const request = require("supertest");
const app = require("../src/index");

jest.mock("redis", () => {
  const mRedis = {
    connect: jest.fn().mockResolvedValue(),
    on: jest.fn(),
    get: jest.fn(),
    setEx: jest.fn().mockResolvedValue(),
    quit: jest.fn().mockResolvedValue()
  };
  return {
    createClient: jest.fn(() => mRedis)
  };
});

jest.mock("../config/db", () => {
  const mockDb = {
    query: jest.fn()
  };
  return {
    connectDb: jest.fn().mockResolvedValue(),
    getDb: jest.fn(() => mockDb)
  };
});

const { getDb } = require("../config/db");
const mockDb = getDb();

describe("ERP Employees Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /employees", () => {
    it("sans x-user-role → 401", async () => {
      const res = await request(app).get("/employees");
      expect(res.status).toBe(401);
    });

    it("avec x-user-role: agent_terrain → 403", async () => {
      const res = await request(app)
        .get("/employees")
        .set("X-User-Role", "agent_terrain");
      expect(res.status).toBe(403);
    });

    it("avec x-user-role: manager → 200, data array", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "uuid-1", first_name: "Jean", last_name: "Dupont", email: "jean@test.cm", department: "RH", status: "active" }],
        rowCount: 1
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: "1" }],
        rowCount: 1
      });

      const res = await request(app)
        .get("/employees")
        .set("X-User-Role", "manager");

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data[0].first_name).toBe("Jean");
    });
  });

  describe("GET /employees/:id", () => {
    it("existant avec x-user-role: manager → 200", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "uuid-1", first_name: "Jean", last_name: "Dupont", email: "jean@test.cm", department: "RH", status: "active" }],
        rowCount: 1
      });

      const res = await request(app)
        .get("/employees/uuid-1")
        .set("X-User-Role", "manager");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("uuid-1");
    });

    it("inexistant → 404", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const res = await request(app)
        .get("/employees/uuid-none")
        .set("X-User-Role", "manager");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /employees", () => {
    it("données valides avec x-user-role: admin → 201", async () => {
      const newEmp = {
        employee_id: "EMP-001",
        first_name: "Jean",
        last_name: "Dupont",
        email: "jean@test.cm",
        department: "RH",
        position: "Manager",
        salary: 500000,
        hire_date: "2026-05-21",
        status: "active"
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "uuid-1", ...newEmp }],
        rowCount: 1
      });

      const res = await request(app)
        .post("/employees")
        .set("X-User-Role", "admin")
        .send(newEmp);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("uuid-1");
    });

    it("données invalides (email manquant) → 400", async () => {
      const res = await request(app)
        .post("/employees")
        .set("X-User-Role", "admin")
        .send({
          employee_id: "EMP-001",
          first_name: "Jean",
          last_name: "Dupont"
        });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /employees/:id", () => {
    it("avec x-user-role: manager → 200", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "uuid-1", first_name: "Jean-Pierre" }],
        rowCount: 1
      });

      const res = await request(app)
        .patch("/employees/uuid-1")
        .set("X-User-Role", "manager")
        .send({ first_name: "Jean-Pierre" });

      expect(res.status).toBe(200);
      expect(res.body.first_name).toBe("Jean-Pierre");
    });
  });

  describe("DELETE /employees/:id", () => {
    it("avec x-user-role: admin → 200", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "uuid-1" }],
        rowCount: 1
      });

      const res = await request(app)
        .delete("/employees/uuid-1")
        .set("X-User-Role", "admin");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Employé désactivé.");
    });
  });
});
