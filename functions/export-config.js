// functions/export-config.js
const db = require('./db');

exports.handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters } = event;
    if (httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const id = queryStringParameters && queryStringParameters.id;
    const code = queryStringParameters && queryStringParameters.code;

    if (!id && !code) {
      return { statusCode: 400, body: 'Provide id or code' };
    }

    let gameRes;
    if (id) {
      gameRes = await db.query('SELECT * FROM games WHERE id = $1', [id]);
    } else {
      gameRes = await db.query('SELECT * FROM games WHERE code = $1', [code]);
    }

    if (gameRes.rows.length === 0) {
      return { statusCode: 404, body: 'Game not found' };
    }

    const game = gameRes.rows[0];

    const assetRes = await db.query(
      `SELECT id, kind, label, url, width, height, format
         FROM game_assets
        WHERE game_id = $1
        ORDER BY created_at`,
      [game.id]
    );

    const exportPayload = {
      id: game.id,
      name: game.name,
      code: game.code,
      description: game.description,
      config: game.config,
      assets: assetRes.rows
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(exportPayload, null, 2)
    };
  } catch (err) {
    console.error('export-config error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
