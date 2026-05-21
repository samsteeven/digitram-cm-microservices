import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failureRate = new Rate('failures');
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 50 },    // Montée rapide
    { duration: '1m',  target: 200 },   // Pic
    { duration: '2m',  target: 500 },   // Stress max
    { duration: '1m',  target: 200 },   // Descente
    { duration: '30s', target: 0 },     // Retour au calme
  ],
  thresholds: {
    http_req_duration: ['p(90)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.10'],
    failures: ['rate<0.15'],
  },
  noConnectionReuse: true,
};

// Login une seule fois et réutiliser le token
const loginPayload = JSON.stringify({
  email: 'admin@agrocam.cm',
  password: 'Admin@2026!',
});
const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
  headers: { 'Content-Type': 'application/json' },
});
const TOKEN = loginRes.status === 200 ? loginRes.json('access_token') : '';

export default function () {
  if (!TOKEN) {
    sleep(1);
    return;
  }

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Frapper aléatoirement tous les endpoints
  const endpoints = [
    { method: 'GET', path: '/api/erp/employees' },
    { method: 'GET', path: '/api/erp/accounting' },
    { method: 'GET', path: '/api/crm/customers' },
    { method: 'GET', path: '/api/crm/orders' },
    { method: 'GET', path: '/api/supply-chain/shipments' },
    { method: 'GET', path: '/api/bi/kpis/snapshot' },
    { method: 'GET', path: '/api/bi/dashboard/global' },
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${endpoint.path}`, { headers });

  const failed = res.status >= 500 || res.status === 0;
  failureRate.add(failed);
  check(res, {
    'status < 500': (r) => r.status < 500,
    'status !== 0': (r) => r.status !== 0,
  });

  sleep(0.1); // 100ms entre les requêtes = 10 req/s par VU
}
