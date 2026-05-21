const request = require("supertest");
const app = require("../index");

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

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "test-jwt-token"),
  verify: jest.fn((token) => {
    if (token === "valid-token" || token === "revoked-token") {
      return { sub: "user-001", role: "admin", email: "admin@agrocam.cm" };
    }
    const err = new Error("Token invalide");
    err.name = "JsonWebTokenError";
    throw err;
  }),
  decode: jest.fn((token) => {
    return { exp: Math.floor(Date.now() / 1000) + 3600 };
  })
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn((password, hash) => {
    if (password === "Admin@2026!") return Promise.resolve(true);
    return Promise.resolve(false);
  })
}));

jest.mock("../src/utils/redis.client", () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  getRedisClient: jest.fn(() => ({
    get: jest.fn((key) => {
      if (key === "blacklist:revoked-token") return Promise.resolve("revoked");
      return Promise.resolve(null);
    }),
    setEx: jest.fn().mockResolvedValue(),
    del: jest.fn().mockResolvedValue()
  }))
}));

describe("Auth Gateway — POST /auth/login", () => {
  it("credentials valides → 200 + JWT", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@agrocam.cm", password: "Admin@2026!" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("access_token");
  });

  it("credentials invalides → 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@agrocam.cm", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("données manquantes → 400", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("Auth Gateway — GET /auth/me", () => {
  it("avec token valide → 200 + profil", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("admin@agrocam.cm");
  });

  it("sans token → 401", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Auth Gateway — POST /auth/logout", () => {
  it("révoquer le token → 200", async () => {
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
  });
});

describe("Auth Gateway — GET /auth/me avec token révoqué", () => {
  it("token révoqué → 401", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer revoked-token");
    expect(res.status).toBe(401);
  });
});

describe("Auth Gateway — GET /health", () => {
  it("GET /health → 200, status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
