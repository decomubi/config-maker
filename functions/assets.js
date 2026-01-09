
// functions/assets.js
const db = require('./db');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { gameId, label, kind, url, width, height, format, metadata } = body;

    if (!gameId || !label || !url) {
      return {
        statusCode: 400,
        body: 'gameId, label and url are required'
      };
    }

    const k = kind || 'image';
    const meta = metadata && typeof metadata === 'object' ? metadata : {};

    const { rows } = await db.query(
      `INSERT INTO game_assets
       (game_id, kind, label, url, width, height, format, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        gameId,
        k,
        label,
        url,
        width || null,
        height || null,
        format || null,
        meta
      ]
    );

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows[0])
    };
  } catch (err) {
    console.error('assets function error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
