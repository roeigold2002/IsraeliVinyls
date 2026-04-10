/*
  # Create stores and records tables

  1. New Tables
    - `stores`
      - `id` (uuid, primary key)
      - `name` (text) - English store name
      - `name_he` (text) - Hebrew store name
      - `url` (text) - Store website URL
      - `platform` (text) - e-commerce platform type
      - `city` (text) - Store location city
      - `logo_emoji` (text) - Emoji representing the store
      - `record_count` (integer) - Cached count of records
      - `avg_price` (numeric) - Cached average price
      - `is_active` (boolean) - Whether store is active
      - `created_at` (timestamptz)

    - `records`
      - `id` (uuid, primary key)
      - `artist` (text) - Artist name
      - `album` (text) - Album name
      - `year` (integer) - Release year
      - `genre` (text) - Music genre
      - `format` (text) - Vinyl format (LP, 7", etc.)
      - `condition` (text) - Record condition
      - `price` (numeric) - Price in ILS
      - `currency` (text) - Currency code
      - `cover_url` (text) - Album cover image URL
      - `product_url` (text) - Direct link to product page
      - `store_id` (uuid, FK to stores)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add read-only policy for anonymous users (public catalog)

  3. Indexes
    - records: artist, album, store_id, genre, price, year
*/

CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_he text NOT NULL,
  url text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT 'custom',
  city text NOT NULL DEFAULT 'תל אביב',
  logo_emoji text NOT NULL DEFAULT '🎵',
  record_count integer NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read stores"
  ON stores FOR SELECT
  TO anon, authenticated
  USING (is_active = true);


CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist text NOT NULL,
  album text NOT NULL,
  year integer,
  genre text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'LP',
  condition text NOT NULL DEFAULT 'New',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  cover_url text NOT NULL DEFAULT '',
  product_url text NOT NULL DEFAULT '',
  store_id uuid NOT NULL REFERENCES stores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read records"
  ON records FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_records_artist ON records(artist);
CREATE INDEX IF NOT EXISTS idx_records_album ON records(album);
CREATE INDEX IF NOT EXISTS idx_records_store_id ON records(store_id);
CREATE INDEX IF NOT EXISTS idx_records_genre ON records(genre);
CREATE INDEX IF NOT EXISTS idx_records_price ON records(price);
CREATE INDEX IF NOT EXISTS idx_records_year ON records(year);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
