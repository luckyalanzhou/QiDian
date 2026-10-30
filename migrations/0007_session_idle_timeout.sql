-- Existing sessions adopt the three-day inactivity limit on upgrade.
UPDATE sessions
SET expires = CASE
  WHEN expires > created + 259200000 THEN created + 259200000
  ELSE expires
END;
