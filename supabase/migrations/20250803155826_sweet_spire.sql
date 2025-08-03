/*
  # Create infographics system

  1. New Tables
    - `infographics`
      - `id` (uuid, primary key)
      - `name` (text, project name)
      - `description` (text, project description)
      - `style_description` (text, style guidelines)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `infographic_pages`
      - `id` (uuid, primary key)
      - `infographic_id` (uuid, foreign key)
      - `title` (text, page title)
      - `content_markdown` (text, original content)
      - `generated_html` (text, AI-generated HTML)
      - `page_order` (integer, for ordering pages)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (since no auth system specified)
*/

-- Create infographics table
CREATE TABLE IF NOT EXISTS infographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  style_description text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create infographic_pages table
CREATE TABLE IF NOT EXISTS infographic_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  infographic_id uuid NOT NULL REFERENCES infographics(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_markdown text NOT NULL DEFAULT '',
  generated_html text DEFAULT '',
  page_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE infographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE infographic_pages ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Anyone can read infographics"
  ON infographics
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create infographics"
  ON infographics
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update infographics"
  ON infographics
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Anyone can delete infographics"
  ON infographics
  FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Anyone can read infographic pages"
  ON infographic_pages
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create infographic pages"
  ON infographic_pages
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update infographic pages"
  ON infographic_pages
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Anyone can delete infographic pages"
  ON infographic_pages
  FOR DELETE
  TO public
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS infographic_pages_infographic_id_idx 
  ON infographic_pages(infographic_id);

CREATE INDEX IF NOT EXISTS infographic_pages_order_idx 
  ON infographic_pages(infographic_id, page_order);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_infographics_updated_at 
  BEFORE UPDATE ON infographics 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_infographic_pages_updated_at 
  BEFORE UPDATE ON infographic_pages 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();