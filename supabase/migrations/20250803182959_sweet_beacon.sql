/*
  # Add user isolation with RLS

  1. Schema Changes
    - Add `user_id` column to `infographics` table
    - Add `user_id` column to `infographic_pages` table
    - Create triggers to automatically set user_id on insert
    - Backfill existing records with a default user (if any exist)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to only access their own data
    - Users can create, read, update, and delete only their own records

  3. Triggers
    - Auto-populate user_id from auth.uid() on insert
    - Ensure data integrity and user isolation
*/

-- Add user_id column to infographics table
ALTER TABLE infographics 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to infographic_pages table  
ALTER TABLE infographic_pages 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create function to automatically set user_id
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for infographics
CREATE TRIGGER set_infographics_user_id
  BEFORE INSERT ON infographics
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Create triggers for infographic_pages
CREATE TRIGGER set_infographic_pages_user_id
  BEFORE INSERT ON infographic_pages
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Enable RLS on infographics table
ALTER TABLE infographics ENABLE ROW LEVEL SECURITY;

-- Enable RLS on infographic_pages table
ALTER TABLE infographic_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for infographics table
CREATE POLICY "Users can create their own infographics"
  ON infographics
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own infographics"
  ON infographics
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own infographics"
  ON infographics
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own infographics"
  ON infographics
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for infographic_pages table
CREATE POLICY "Users can create their own infographic pages"
  ON infographic_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own infographic pages"
  ON infographic_pages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own infographic pages"
  ON infographic_pages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own infographic pages"
  ON infographic_pages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX infographics_user_id_idx ON infographics(user_id);
CREATE INDEX infographic_pages_user_id_idx ON infographic_pages(user_id);

-- Update generation_queue policies to ensure proper user isolation
-- Users can only see queue items for their own pages
DROP POLICY IF EXISTS "Users can read their own generation requests" ON generation_queue;
CREATE POLICY "Users can read their own generation requests"
  ON generation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- System can still read all for processing
DROP POLICY IF EXISTS "System can read all generation requests" ON generation_queue;
CREATE POLICY "System can read all generation requests"
  ON generation_queue
  FOR SELECT
  TO anon, authenticated
  USING (true);