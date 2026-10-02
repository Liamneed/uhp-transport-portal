PRAGMA foreign_keys = ON;

ALTER TABLE bookings
  ADD COLUMN autocab_booked_by TEXT;

ALTER TABLE bookings
  ADD COLUMN autocab_booking_source TEXT;

ALTER TABLE bookings
  ADD COLUMN autocab_booked_at TEXT;


/*
  Backfill existing Autocab-linked bookings
  from their retained BookingCreated payload.

  Pricing is deliberately not copied here.
*/
UPDATE bookings
SET
  autocab_booked_by = (
    SELECT
      json_extract(
        ie.payload_json,
        '$.BookedBy'
      )
    FROM integration_events ie
    WHERE ie.provider = 'autocab'
      AND ie.route_suffix = 'created'
      AND ie.autocab_booking_id =
        bookings.autocab_booking_id
      AND json_valid(ie.payload_json)
    ORDER BY ie.id ASC
    LIMIT 1
  ),

  autocab_booking_source = (
    SELECT
      json_extract(
        ie.payload_json,
        '$.BookingSource'
      )
    FROM integration_events ie
    WHERE ie.provider = 'autocab'
      AND ie.route_suffix = 'created'
      AND ie.autocab_booking_id =
        bookings.autocab_booking_id
      AND json_valid(ie.payload_json)
    ORDER BY ie.id ASC
    LIMIT 1
  ),

  autocab_booked_at = (
    SELECT
      json_extract(
        ie.payload_json,
        '$.BookedAtTime'
      )
    FROM integration_events ie
    WHERE ie.provider = 'autocab'
      AND ie.route_suffix = 'created'
      AND ie.autocab_booking_id =
        bookings.autocab_booking_id
      AND json_valid(ie.payload_json)
    ORDER BY ie.id ASC
    LIMIT 1
  )

WHERE autocab_booking_id IS NOT NULL;
