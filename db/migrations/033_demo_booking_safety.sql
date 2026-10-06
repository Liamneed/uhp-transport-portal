ALTER TABLE bookings
ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0
CHECK (is_demo IN (0, 1));

ALTER TABLE bookings
ADD COLUMN demo_batch_key TEXT;

CREATE INDEX idx_bookings_demo
ON bookings(is_demo, demo_batch_key);
