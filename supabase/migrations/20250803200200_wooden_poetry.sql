/*
  # Add infographic pages history and prompter feature

  1. New Tables
    - `infographic_pages_history`
      - `id` (uuid, primary key)
      - `infographic_page_id` (uuid, foreign key to infographic_pages)
      - `generated_html` (text, the HTML content at this point in history)
      - `user_comment` (text, the comment that led to this generation)
      - `user_id` (uuid, foreign key to users)
      - `created_at` (timestamp)

  2. Changes to Existing Tables
    - Add `last_generation_comment` to `infographic_pages` table
    - Add `user_comment` to `generation_queue` table

  3. Security
    - Enable RLS on `infographic_pages_history` table
    - Add policies for authenticated users to read/write their own history
*/

-- Add last_generation_comment to infographic_pages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'infographic_pages' AND column_name = 'last_generation_comment'
  ) THEN
    ALTER TABLE infographic_pages ADD COLUMN last_generation_comment text DEFAULT '';
  END IF;
END $$;

-- Add user_comment to generation_queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generation_queue' AND column_name = 'user_comment'
  ) THEN
    ALTER TABLE generation_queue ADD COLUMN user_comment text DEFAULT '';
  END IF;
END $$;

-- Create infographic_pages_history table
CREATE TABLE IF NOT EXISTS infographic_pages_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  infographic_page_id uuid NOT NULL REFERENCES infographic_pages(id) ON DELETE CASCADE,
  generated_html text NOT NULL DEFAULT '',
  user_comment text NOT NULL DEFAULT '',
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on infographic_pages_history
ALTER TABLE infographic_pages_history ENABLE ROW LEVEL SECURITY;

-- Add policies for infographic_pages_history
CREATE POLICY "Users can read their own page history"
  ON infographic_pages_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own page history"
  ON infographic_pages_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS infographic_pages_history_page_id_idx 
  ON infographic_pages_history(infographic_page_id);

CREATE INDEX IF NOT EXISTS infographic_pages_history_created_at_idx 
  ON infographic_pages_history(infographic_page_id, created_at DESC);