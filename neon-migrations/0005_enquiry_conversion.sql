-- Run as the Neon owner. Desktop receives EXECUTE only through gruhswad_desktop_sync.
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS converted_reference TEXT;

CREATE OR REPLACE FUNCTION gruhswad_convert_enquiry(target_id UUID,target_reference TEXT)
RETURNS enquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE updated enquiries;
BEGIN
  IF target_reference IS NULL OR LENGTH(TRIM(target_reference))<4 OR LENGTH(target_reference)>80 THEN
    RAISE EXCEPTION 'Invalid conversion reference';
  END IF;
  UPDATE enquiries SET status='converted',converted_at=COALESCE(converted_at,NOW()),converted_reference=COALESCE(converted_reference,target_reference),updated_at=NOW()
  WHERE id=target_id AND (converted_reference IS NULL OR converted_reference=target_reference)
  RETURNING * INTO updated;
  IF updated.id IS NULL THEN RAISE EXCEPTION 'Enquiry not found or already converted elsewhere'; END IF;
  IF NOT EXISTS(SELECT 1 FROM enquiry_events WHERE enquiry_id=target_id AND event_type='converted' AND payload->>'reference'=target_reference) THEN
    INSERT INTO enquiry_events(enquiry_id,event_type,payload) VALUES(target_id,'converted',jsonb_build_object('reference',target_reference));
  END IF;
  RETURN updated;
END $$;
REVOKE ALL ON FUNCTION gruhswad_convert_enquiry(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gruhswad_convert_enquiry(UUID,TEXT) TO gruhswad_desktop_sync;
