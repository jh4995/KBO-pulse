INSERT INTO users (username)
SELECT 'user_' || i
FROM generate_series(1, 200000) AS s(i)
ON CONFLICT (username) DO NOTHING;