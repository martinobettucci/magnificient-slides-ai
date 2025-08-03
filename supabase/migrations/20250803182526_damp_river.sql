/*
  # Create Generation Queue System

  1. New Tables
    - `generation_queue`
      - `id` (uuid, primary key)
      - `infographic_page_id` (uuid, foreign key to infographic_pages)
      - `user_id` (uuid, foreign key to auth.users)
      - `status` (text, enum: pending, processing, completed, failed)
      - `requested_at` (timestamp)
      - `processed_at` (timestamp, nullable)
      - `error_message` (text, nullable)

  2. Security
    - Enable RLS on `generation_queue` table
    - Add policies for users to manage their own queue items
    - Add policy for system to process queue items

  3. Indexes
    - Index on status and requested_at for efficient FIFO processing
    - Index on user_id for user-specific queries
*/

-- Create generation queue table
CREATE TABLE IF NOT EXISTS generation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  infographic_page_id uuid NOT NULL REFERENCES infographic_pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE generation_queue ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient processing
CREATE INDEX IF NOT EXISTS generation_queue_status_requested_at_idx 
  ON generation_queue (status, requested_at) 
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS generation_queue_user_id_idx 
  ON generation_queue (user_id);

CREATE INDEX IF NOT EXISTS generation_queue_page_id_idx 
  ON generation_queue (infographic_page_id);

-- RLS Policies
CREATE POLICY "Users can insert their own generation requests"
  ON generation_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own generation requests"
  ON generation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can read all generation requests"
  ON generation_queue
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "System can update generation requests"
  ON generation_queue
  FOR UPDATE
  TO anon, authenticated
  USING (true);

-- Function to clean up old completed/failed requests (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_generation_requests()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM generation_queue 
  WHERE status IN ('completed', 'failed') 
    AND processed_at < now() - interval '7 days';
END;
$$;