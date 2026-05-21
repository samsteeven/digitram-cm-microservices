const { processQueueItem } = require("../src/sync/sync.worker");
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

jest.mock("../src/blockchain/fabric.client", () => ({
  connectFabric: jest.fn().mockResolvedValue(false),
  disconnectFabric: jest.fn(),
  isConnected: jest.fn().mockReturnValue(false),
  recordCheckpointOnChain: jest.fn().mockResolvedValue({ onChain: false, reason: "mock" }),
  updateShipmentStatusOnChain: jest.fn().mockResolvedValue({ onChain: false, reason: "mock" }),
  queryShipmentHistory: jest.fn().mockResolvedValue([]),
  recordShipmentOnChain: jest.fn().mockResolvedValue({ onChain: false, reason: "mock" })
}));

jest.mock("../config/redis", () => {
  let store = {};
  return {
    connectRedis: jest.fn().mockResolvedValue(),
    getRedis: jest.fn(() => ({
      get: jest.fn((k) => Promise.resolve(store[k] || null)),
      setEx: jest.fn((k, t, v) => { store[k] = v; return Promise.resolve(); }),
      lPush: jest.fn((k, v) => { if (!store[k]) store[k] = []; store[k].push(v); return Promise.resolve(); }),
      rPop: jest.fn((k) => { if (!store[k] || store[k].length === 0) return Promise.resolve(null); return Promise.resolve(store[k].pop()); }),
      lLen: jest.fn((k) => Promise.resolve(store[k] ? store[k].length : 0))
    }))
  };
});

const { getDb } = require("../config/db");
const mockDb = getDb();

describe("Sync Worker — processQueueItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("INSERT checkpoint avec offline_id nouveau → insère en BDD", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Check for existing offline_id
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert checkpoint
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert sync_queue

    const item = {
      operation: "INSERT",
      entity_type: "checkpoint",
      offline_id: "new-offline-id",
      payload: {
        shipment_id: "00000000-0000-0000-0000-000000000000",
        location: "Checkpoint A",
        latitude: 4.123,
        longitude: 9.456,
        status: "at_checkpoint",
        notes: "No issues"
      }
    };

    const result = await processQueueItem(item);
    expect(result.success).toBe(true);
    expect(mockDb.query).toHaveBeenCalled();
  });

  it("INSERT checkpoint avec offline_id existant → retourne { skipped: true }", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: "some-uuid" }], rowCount: 1 }); // Existing offline_id

    const item = {
      operation: "INSERT",
      entity_type: "checkpoint",
      offline_id: "existing-offline-id",
      payload: {}
    };

    const result = await processQueueItem(item);
    expect(result.skipped).toBe(true);
  });

  it("UPDATE shipment_status → appelle UPDATE SQL", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update shipment status
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert sync_queue

    const item = {
      operation: "UPDATE",
      entity_type: "shipment_status",
      payload: {
        shipment_id: "00000000-0000-0000-0000-000000000000",
        status: "in_transit"
      }
    };

    const result = await processQueueItem(item);
    expect(result.success).toBe(true);
    // Verify it called the UPDATE SQL query on shipments
    const updateCall = mockDb.query.mock.calls.find(call => call[0].includes("UPDATE shipments"));
    expect(updateCall).toBeDefined();
  });
});

describe("Sync Route — POST /sync/push", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Body valide avec 2 items → 202, accepted: 2", async () => {
    const res = await request(app)
      .post("/sync/push")
      .set("X-User-Role", "agent_terrain")
      .send({
        items: [
          {
            operation: "INSERT",
            entity_type: "checkpoint",
            offline_id: "off-1",
            payload: { shipment_id: "00000000-0000-0000-0000-000000000000", location: "Loc 1", status: "at_checkpoint" }
          },
          {
            operation: "UPDATE",
            entity_type: "shipment_status",
            offline_id: "off-2",
            payload: { shipment_id: "00000000-0000-0000-0000-000000000000", status: "delivered" }
          }
        ]
      });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected).toBe(0);
  });

  it("Body avec 1 item invalide (entity_type absent) → 202, accepted: 0, rejected: 1", async () => {
    const res = await request(app)
      .post("/sync/push")
      .set("X-User-Role", "agent_terrain")
      .send({
        items: [
          {
            operation: "INSERT",
            offline_id: "off-3",
            payload: {}
          }
        ]
      });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected).toBe(1);
  });

  it("Body vide → 400", async () => {
    const res = await request(app)
      .post("/sync/push")
      .set("X-User-Role", "agent_terrain")
      .send({});

    expect(res.status).toBe(400);
  });
});
