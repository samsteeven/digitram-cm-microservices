import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Métriques personnalisées ──────────────────────────
const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency_ms');

// ─── Configuration ──────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USERS = [
  { email: 'admin@agrocam.cm', password: 'Admin@2026!', role: 'admin' },
  { email: 'manager@agrocam.cm', password: 'Manager@2026!', role: 'manager' },
  { email: 'agent@agrocam.cm', password: 'Agent@2026!', role: 'agent_terrain' },
];

// ─── Stades de charge ───────────────────────────────────
// Scénario 1 : Montée en charge progressive
// Scénario 2 : Pic soutenu
// Scénario 3 : Stress test
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },   // Montée
        { duration: '2m', target: 50 },   // Charge modérée
        { duration: '2m', target: 100 },  // Charge normale
        { duration: '1m', target: 0 },    // Descente
      ],
      tags: { scenario: 'ramp_up' },
    },
    sustained_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '3m',
      startTime: '6m',
      tags: { scenario: 'sustained' },
    },
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '1m', target: 200 },  // Pic
        { duration: '2m', target: 300 },  // Stress
        { duration: '1m', target: 0 },    // Descente
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.02'],
    errors: ['rate<0.05'],
  },
};

// ─── Helper : authentification ───────────────────────────
function login(user) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(res, { 'login success': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
  latencyTrend.add(res.timings.duration);

  if (res.status === 200) {
    return res.json('access_token');
  }
  return null;
}

// ─── Helper : appel protégé ──────────────────────────────
function callAPI(method, path, token, body = null) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const res = method === 'GET'
    ? http.get(`${BASE_URL}${path}`, params)
    : http.post(`${BASE_URL}${path}`, JSON.stringify(body), params);

  check(res, { [`${method} ${path}`]: (r) => r.status < 500 });
  errorRate.add(res.status >= 500);
  latencyTrend.add(res.timings.duration);

  return res;
}

// ─── Scénario principal ──────────────────────────────────
export default function () {
  const user = USERS[Math.floor(Math.random() * USERS.length)];

  group('Authentification', () => {
    const token = login(user);
    if (!token) { sleep(1); return; }

    group('ERP — Lecture employés', () => {
      callAPI('GET', '/api/erp/employees', token);
      callAPI('GET', '/api/erp/accounting', token);
      callAPI('GET', '/api/erp/purchase-orders', token);
    });

    group('CRM — Clients et commandes', () => {
      callAPI('GET', '/api/crm/customers', token);
      callAPI('GET', '/api/crm/orders', token);
    });

    group('Supply Chain — Expéditions', () => {
      callAPI('GET', '/api/supply-chain/shipments', token);
      callAPI('GET', '/api/supply-chain/checkpoints', token);
    });

    group('BI — KPIs et dashboards', () => {
      callAPI('GET', '/api/bi/kpis/snapshot', token);
      callAPI('GET', '/api/bi/dashboard/global', token);
    });

    // Push offline (agent terrain uniquement)
    if (user.role === 'agent_terrain') {
      callAPI('POST', '/api/supply-chain/sync/push', token, {
        items: [{
          operation: 'INSERT',
          entity_type: 'checkpoint',
          offline_id: `k6-${Date.now()}`,
          payload: {
            shipment_id: 'test-shipment',
            location: 'Checkpoint Test K6',
            latitude: 5.47,
            longitude: 10.42,
            status: 'at_checkpoint',
            notes: 'Test de charge',
          },
        }],
      });
    }
  });

  sleep(Math.random() * 2 + 0.5);
}
