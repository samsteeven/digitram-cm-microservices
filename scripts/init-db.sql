-- ══════════════════════════════════════════════════════════════════
--  DIGITRANS-CM — Initialisation des bases de données
--  Projet AGROCAM S.A. — Architecture microservices
-- ══════════════════════════════════════════════════════════════════

-- Création des bases dédiées à chaque microservice
CREATE DATABASE erp_db;
CREATE DATABASE crm_db;
CREATE DATABASE supply_db;
CREATE DATABASE bi_db;

-- ─── Schéma ERP ───────────────────────────────────────────────────
\c erp_db;

CREATE TABLE employees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    email       VARCHAR(200) UNIQUE NOT NULL,
    department  VARCHAR(100),
    position    VARCHAR(100),
    salary      DECIMAL(15,2),
    hire_date   DATE,
    status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounting_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_ref    VARCHAR(30) UNIQUE NOT NULL,
    entry_type   VARCHAR(50) NOT NULL CHECK (entry_type IN ('debit','credit','adjustment')),
    amount       DECIMAL(15,2) NOT NULL,
    currency     VARCHAR(3) DEFAULT 'XAF',
    description  TEXT,
    entry_date   DATE NOT NULL,
    fiscal_year  INTEGER NOT NULL,
    created_by   UUID,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref      VARCHAR(30) UNIQUE NOT NULL,
    supplier_name  VARCHAR(200) NOT NULL,
    total_amount   DECIMAL(15,2) NOT NULL,
    currency       VARCHAR(3) DEFAULT 'XAF',
    status         VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','approved','delivered','cancelled')),
    order_date     DATE NOT NULL,
    delivery_date  DATE,
    created_by     UUID,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Schéma CRM ───────────────────────────────────────────────────
\c crm_db;

CREATE TABLE customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_ref  VARCHAR(20) UNIQUE NOT NULL,
    full_name     VARCHAR(200) NOT NULL,
    email         VARCHAR(200),
    phone         VARCHAR(30),
    city          VARCHAR(100),
    loyalty_points INTEGER DEFAULT 0,
    segment       VARCHAR(50) DEFAULT 'standard' CHECK (segment IN ('vip','premium','standard')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref     VARCHAR(30) UNIQUE NOT NULL,
    customer_id   UUID REFERENCES customers(id),
    restaurant    VARCHAR(100) NOT NULL,
    total_amount  DECIMAL(10,2) NOT NULL,
    currency      VARCHAR(3) DEFAULT 'XAF',
    status        VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
    order_type    VARCHAR(20) DEFAULT 'dine-in' CHECK (order_type IN ('dine-in','takeaway','delivery')),
    notes         TEXT,
    ordered_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_name VARCHAR(200) NOT NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  DECIMAL(10,2) NOT NULL,
    subtotal    DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ─── Schéma Supply Chain ──────────────────────────────────────────
\c supply_db;

CREATE TABLE shipments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_ref    VARCHAR(30) UNIQUE NOT NULL,
    origin          VARCHAR(200) NOT NULL,
    destination     VARCHAR(200) NOT NULL,
    product_type    VARCHAR(100) NOT NULL,
    quantity        DECIMAL(15,2),
    unit            VARCHAR(30),
    status          VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','in_transit','at_checkpoint','delivered','delayed','lost')),
    carrier         VARCHAR(200),
    departure_date  TIMESTAMPTZ,
    expected_arrival TIMESTAMPTZ,
    actual_arrival  TIMESTAMPTZ,
    synced          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE checkpoints (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id  UUID REFERENCES shipments(id) ON DELETE CASCADE,
    location     VARCHAR(200) NOT NULL,
    latitude     DECIMAL(9,6),
    longitude    DECIMAL(9,6),
    status       VARCHAR(50) NOT NULL,
    notes        TEXT,
    recorded_at  TIMESTAMPTZ DEFAULT NOW(),
    synced       BOOLEAN DEFAULT TRUE,
    offline_id   VARCHAR(50)  -- ID local généré offline, pour dédoublonnage à la sync
);

-- Table de queue pour la synchronisation offline-first
CREATE TABLE sync_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type  VARCHAR(50) NOT NULL,
    entity_id    UUID,
    operation    VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    payload      JSONB NOT NULL,
    retries      INTEGER DEFAULT 0,
    status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Schéma BI ────────────────────────────────────────────────────
\c bi_db;

CREATE TABLE kpi_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    module        VARCHAR(50) NOT NULL CHECK (module IN ('erp','crm','supply_chain','global')),
    metric_name   VARCHAR(100) NOT NULL,
    metric_value  DECIMAL(20,4),
    metric_unit   VARCHAR(30),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (snapshot_date, module, metric_name)
);

CREATE TABLE dashboard_configs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(200) NOT NULL,
    owner_role   VARCHAR(50) NOT NULL,
    config_json  JSONB NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
