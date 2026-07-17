-- DO $$
-- DECLARE
--     v_game_id     INTEGER;
--     v_game_date   DATE;
--     v_num_votes   INTEGER;
--     v_game_count  INTEGER := 0;
--     v_total       INTEGER;
-- BEGIN
--     FOR v_game_id, v_game_date IN
--         SELECT game_id, game_date
--         FROM games
--         WHERE status = 'final'
--         ORDER BY game_id
--     LOOP
--         v_num_votes := 700 + floor(random() * 700)::INTEGER;

--         INSERT INTO votes (game_id, player_id, user_id, voted_at)
--         SELECT
--             v_game_id,
--             sub.player_id,
--             sub.user_id,
--             v_game_date + (random() * interval '4 hours')
--         FROM (
--             SELECT
--                 gb.player_id,
--                 u.user_id,
--                 ROW_NUMBER() OVER (ORDER BY random()) AS rn
--             FROM (
--                 SELECT DISTINCT player_id
--                 FROM game_batters
--                 WHERE game_id = v_game_id
--                   AND player_id IS NOT NULL
--             ) gb
--             CROSS JOIN (
--                 SELECT user_id
--                 FROM users
--                 ORDER BY random()
--                 LIMIT v_num_votes
--             ) u
--         ) sub
--         WHERE sub.rn <= v_num_votes
--         ON CONFLICT ON CONSTRAINT uidx_user_game DO NOTHING;

--         v_game_count := v_game_count + 1;

--         IF v_game_count % 200 = 0 THEN
--             RAISE NOTICE 'progress: % games done', v_game_count;
--         END IF;
--     END LOOP;

--     SELECT COUNT(*) INTO v_total FROM votes;
--     RAISE NOTICE 'done: % total votes', v_total;
-- END $$;

-- VACUUM ANALYZE votes;
-- VACUUM ANALYZE users;

DO $$
DECLARE
    v_game_id     INTEGER;
    v_game_date   DATE;
    v_player_ids  INTEGER[];
    v_count       INTEGER;
BEGIN
    FOR v_game_id, v_game_date IN
        SELECT game_id, game_date FROM games
        WHERE game_id IN (1557, 1558, 1559, 1560)
        ORDER BY game_id
    LOOP
        SELECT array_agg(DISTINCT player_id) INTO v_player_ids
        FROM game_batters
        WHERE game_id = v_game_id AND player_id IS NOT NULL;

        RAISE NOTICE 'Seeding game % (%) — % players available',
            v_game_id, v_game_date, array_length(v_player_ids, 1);

        INSERT INTO votes (game_id, player_id, user_id, voted_at)
        SELECT
            v_game_id,
            v_player_ids[1 + floor(random() * array_length(v_player_ids, 1))::int],
            u.user_id,
            v_game_date + (random() * interval '4 hours')
        FROM users u
        ON CONFLICT ON CONSTRAINT uidx_user_game DO NOTHING;

        SELECT COUNT(*) INTO v_count FROM votes WHERE game_id = v_game_id;
        RAISE NOTICE 'Game % done — % votes', v_game_id, v_count;
    END LOOP;

    RAISE NOTICE '=== Total votes: % ===', (SELECT COUNT(*) FROM votes);
END $$;

VACUUM ANALYZE votes;
VACUUM ANALYZE users;