
// functions/games.js
const db = require('./db');

exports.handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters } = event;

    if (httpMethod === 'GET') {
      const id = queryStringParameters && queryStringParameters.id;
      if (id) {
        // Single game with assets
        const gameRes = await db.query(
          'SELECT * FROM games WHERE id = $1',
          [id]
        );
        if (gameRes.rows.length === 0) {
          return { statusCode: 404, body: 'Game not found' };
        }
        const assetRes = await db.query(
          'SELECT * FROM game_assets WHERE game_id = $1 ORDER BY created_at',
          [id]
        );
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game: gameRes.rows[0],
            assets: assetRes.rows
          })
        };
      } else {
        // List games
        const { rows } = await db.query(
          'SELECT id, name, code, description, created_at, updated_at FROM games ORDER BY created_at DESC'
        );
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows)
        };
      }
    }

    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { id, name, code, description, config } = body;

      if (!name || !code) {
        return {
          statusCode: 400,
          body: 'name and code are required'
        };
      }

      const cfg = config && typeof config === 'object' ? config : {};

      if (id) {
        // Update
        const { rows } = await db.query(
          `UPDATE games
           SET name = $1,
               code = $2,
               description = $3,
               config = $4,
               updated_at = now()
           WHERE id = $5
           RETURNING *`,
          [name, code, description || null, cfg, id]
        );
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows[0])
        };
      } else {
        // Create
        const { rows } = await db.query(
          `INSERT INTO games (name, code, description, config)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [name, code, description || null, cfg]
        );
        return {
          statusCode: 201,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows[0])
        };
      }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (err) {
    console.error('games function error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
