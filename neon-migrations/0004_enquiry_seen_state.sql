-- Run as the Neon owner. The desktop login inherits this through gruhswad_desktop_sync.
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION gruhswad_mark_enquiry_seen(target_id UUID)
RETURNS enquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  updated enquiries;
  was_unread BOOLEAN;
BEGIN
  SELECT seen_at IS NULL INTO was_unread FROM enquiries WHERE id=target_id FOR UPDATE;
  UPDATE enquiries
  SET seen_at=COALESCE(seen_at,NOW())
  WHERE id=target_id
  RETURNING * INTO updated;
  IF updated.id IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;
  IF was_unread THEN
    INSERT INTO enquiry_events(enquiry_id,event_type,payload)
    VALUES(target_id,'seen','{}'::jsonb);
  END IF;
  RETURN updated;
END $$;

REVOKE ALL ON FUNCTION gruhswad_mark_enquiry_seen(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gruhswad_mark_enquiry_seen(UUID) TO gruhswad_desktop_sync;
