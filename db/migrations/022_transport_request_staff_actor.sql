/*
  Allow Special Transport request history to identify
  restricted self-service staff actors independently of
  normal portal users.
*/

ALTER TABLE transport_request_events
ADD COLUMN actor_staff_identity_id INTEGER
  REFERENCES transport_staff_identities(id)
  ON DELETE SET NULL;

CREATE INDEX idx_transport_request_events_staff_actor
ON transport_request_events(
  actor_staff_identity_id,
  created_at
);
