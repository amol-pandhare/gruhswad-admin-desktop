-- Run as the Neon owner after replacing gruhswad_desktop_sync with the deployed sync role.
REVOKE ALL ON FUNCTION gruhswad_transition_enquiry(UUID,TEXT) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gruhswad_desktop_sync;
GRANT SELECT ON TABLE enquiries,enquiry_events TO gruhswad_desktop_sync;
GRANT EXECUTE ON FUNCTION gruhswad_transition_enquiry(UUID,TEXT) TO gruhswad_desktop_sync;
