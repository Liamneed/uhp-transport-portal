PRAGMA foreign_keys = ON;

/*
  SQLite CHECK expressions that evaluate to NULL pass.

  Migration 017 validates coordinate ranges when both
  coordinates are supplied, but a single latitude or
  longitude can otherwise bypass the pair check.

  These triggers explicitly require coordinate pairs.
*/

CREATE TRIGGER IF NOT EXISTS
  trg_transport_requests_coordinates_insert
BEFORE INSERT ON transport_requests
FOR EACH ROW
WHEN
  (
    (NEW.pickup_latitude IS NULL)
    !=
    (NEW.pickup_longitude IS NULL)
  )
  OR
  (
    (NEW.destination_latitude IS NULL)
    !=
    (NEW.destination_longitude IS NULL)
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Latitude and longitude must be supplied together'
  );
END;


CREATE TRIGGER IF NOT EXISTS
  trg_transport_requests_coordinates_update
BEFORE UPDATE OF
  pickup_latitude,
  pickup_longitude,
  destination_latitude,
  destination_longitude
ON transport_requests
FOR EACH ROW
WHEN
  (
    (NEW.pickup_latitude IS NULL)
    !=
    (NEW.pickup_longitude IS NULL)
  )
  OR
  (
    (NEW.destination_latitude IS NULL)
    !=
    (NEW.destination_longitude IS NULL)
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Latitude and longitude must be supplied together'
  );
END;
