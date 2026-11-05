CREATE TABLE shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tax_bps integer NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
  slot_capacity integer NOT NULL DEFAULT 12 CHECK (slot_capacity BETWEEN 0 AND 500),
  demo boolean NOT NULL DEFAULT false
);
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','cashier')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE TABLE login_attempts (
  identity text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 1
);
CREATE TABLE menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  name text NOT NULL,
  category text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active boolean NOT NULL DEFAULT true,
  public boolean NOT NULL DEFAULT true,
  recipe_complete boolean NOT NULL DEFAULT false
);
CREATE INDEX menus_shop ON menus(shop_id);
CREATE TABLE ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('g','ml','buah')),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  minimum integer NOT NULL DEFAULT 0 CHECK (minimum >= 0)
);
CREATE TABLE recipes (
  menu_id uuid NOT NULL REFERENCES menus(id),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (menu_id, ingredient_id)
);
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  reference text UNIQUE NOT NULL,
  name text NOT NULL,
  contact text NOT NULL,
  date date NOT NULL,
  slot text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','preparing','ready','completed','cancelled')),
  items jsonb NOT NULL,
  tax_bps integer NOT NULL,
  subtotal bigint NOT NULL,
  tax bigint NOT NULL,
  total bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_shop ON orders(shop_id, status);
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  reference text UNIQUE NOT NULL,
  name text NOT NULL,
  contact text NOT NULL,
  date date NOT NULL,
  slot text NOT NULL,
  guests int NOT NULL CHECK (guests > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_slot ON bookings(shop_id, date, slot);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  shop_name text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  order_id uuid UNIQUE REFERENCES orders(id),
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  items jsonb NOT NULL,
  tax_bps integer NOT NULL,
  subtotal bigint NOT NULL,
  tax bigint NOT NULL,
  total bigint NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','qris')),
  received bigint,
  change_due bigint,
  voided_at timestamptz,
  voided_by uuid REFERENCES accounts(id),
  void_reason text,
  restocked boolean,
  CHECK (total = subtotal + tax),
  CHECK ((method = 'qris' AND received IS NULL AND change_due IS NULL)
    OR (method = 'cash' AND received IS NOT NULL AND change_due = received - total AND change_due >= 0))
);
CREATE INDEX transactions_shop_day ON transactions(shop_id, date, created_at);
CREATE TABLE stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  menu_id uuid REFERENCES menus(id),
  ingredient_id uuid REFERENCES ingredients(id),
  date date NOT NULL,
  delta integer NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((menu_id IS NULL) <> (ingredient_id IS NULL))
);
CREATE INDEX moves_day ON stock_moves(shop_id, date, menu_id);
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  date date NOT NULL,
  category text NOT NULL CHECK (category IN ('ingredient','operational','salary')),
  description text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','other')),
  account_id uuid NOT NULL REFERENCES accounts(id)
);
CREATE INDEX expenses_shop_day ON expenses(shop_id, date);
CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  expense_id uuid UNIQUE NOT NULL REFERENCES expenses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  package_size integer CHECK (package_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE day_closings (
  shop_id uuid NOT NULL REFERENCES shops(id),
  date date NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  opening_cash bigint CHECK (opening_cash >= 0),
  counted_cash bigint CHECK (counted_cash >= 0),
  other_cash bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, date)
);
CREATE TABLE daily_sales (
  shop_id uuid NOT NULL REFERENCES shops(id),
  menu_id uuid NOT NULL REFERENCES menus(id),
  date date NOT NULL,
  source text NOT NULL CHECK (source IN ('manual','pos')),
  prepared int NOT NULL CHECK (prepared BETWEEN 0 AND 100000),
  sold int NOT NULL CHECK (sold BETWEEN 0 AND prepared),
  stockout boolean NOT NULL,
  event boolean NOT NULL,
  PRIMARY KEY (shop_id, menu_id, date),
  CHECK (NOT stockout OR (sold = prepared AND sold > 0))
);
CREATE TABLE production_plans (
  shop_id uuid NOT NULL REFERENCES shops(id),
  menu_id uuid NOT NULL REFERENCES menus(id),
  date date NOT NULL,
  portions int NOT NULL CHECK (portions BETWEEN 0 AND 100000),
  event boolean NOT NULL,
  forecast jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, menu_id, date)
);
CREATE TABLE operations_keys (
  shop_id uuid NOT NULL REFERENCES shops(id),
  key uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (shop_id, key)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  action text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
