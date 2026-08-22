ALTER TABLE orders ADD COLUMN IF NOT EXISTS handoff_status TEXT NOT NULL DEFAULT 'created';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'awaiting_review';

UPDATE orders
SET handoff_status = CASE WHEN status = 'handoff_created' THEN 'created' ELSE 'customer_confirmed' END
WHERE handoff_status = 'created' AND status <> 'handoff_created';

UPDATE orders
SET operational_status = CASE
  WHEN status IN ('handoff_created','customer_confirmed_sent') THEN 'awaiting_review'
  ELSE status
END
WHERE operational_status = 'awaiting_review'
  AND status NOT IN ('handoff_created','customer_confirmed_sent');

DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid='enquiries'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE enquiries DROP CONSTRAINT %I',constraint_name);
  END IF;
  ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
    CHECK(status IN ('new','reviewing','contacted','quoted','converted','closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION gruhswad_transition_enquiry(target_id UUID,next_status TEXT)
RETURNS enquiries LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE updated enquiries;
BEGIN
  IF next_status NOT IN ('new','reviewing','quoted','closed') THEN
    RAISE EXCEPTION 'Unsupported enquiry status';
  END IF;
  UPDATE enquiries SET status=next_status,updated_at=NOW()
  WHERE id=target_id RETURNING * INTO updated;
  IF updated.id IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;
  INSERT INTO enquiry_events(enquiry_id,event_type,payload)
  VALUES(target_id,'status_changed',jsonb_build_object('status',next_status));
  RETURN updated;
END $$;

CREATE OR REPLACE FUNCTION gruhswad_transition_order(target_id UUID,next_status TEXT)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE updated orders; current_status TEXT; current_rank INTEGER; next_rank INTEGER;
BEGIN
  IF next_status NOT IN ('awaiting_review','confirmed','preparing','ready','completed','cancelled') THEN
    RAISE EXCEPTION 'Unsupported order status';
  END IF;
  SELECT operational_status INTO current_status FROM orders WHERE id=target_id FOR UPDATE;
  IF current_status IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF current_status IN ('completed','cancelled') AND next_status<>current_status THEN
    RAISE EXCEPTION 'Completed and cancelled orders are terminal';
  END IF;
  current_rank=CASE current_status WHEN 'awaiting_review' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 WHEN 'completed' THEN 4 ELSE 99 END;
  next_rank=CASE next_status WHEN 'awaiting_review' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 WHEN 'completed' THEN 4 ELSE 99 END;
  IF next_status<>'cancelled' AND next_rank<current_rank THEN
    RAISE EXCEPTION 'Order status cannot move backwards';
  END IF;
  UPDATE orders SET operational_status=next_status,status=next_status,updated_at=NOW()
  WHERE id=target_id RETURNING * INTO updated;
  IF current_status<>next_status THEN
    INSERT INTO order_events(order_id,event_type,payload)
    VALUES(target_id,'admin_status_changed',jsonb_build_object('status',next_status,'previousStatus',current_status));
  END IF;
  RETURN updated;
END $$;

REVOKE ALL ON FUNCTION gruhswad_transition_enquiry(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION gruhswad_transition_order(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gruhswad_transition_enquiry(UUID,TEXT) TO gruhswad_desktop_sync;
GRANT EXECUTE ON FUNCTION gruhswad_transition_order(UUID,TEXT) TO gruhswad_desktop_sync;
