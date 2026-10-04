/*
  Allow audit_log rows to identify restricted
  staff-transport actors as well as normal portal users.

  Existing rows remain unchanged.
*/
ALTER TABLE audit_log
  ADD COLUMN actor_staff_identity_id INTEGER
    REFERENCES transport_staff_identities(id);

CREATE INDEX idx_audit_log_staff_actor
  ON audit_log(
    actor_staff_identity_id,
    id
  );
