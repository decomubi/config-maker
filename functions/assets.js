// functions/assets.js
const db = require('./db');

exports.handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters } = event;

    // CREATE asset
    if (httpMethod === 'POST') {
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
    }

    // UPDATE target sizes
    if (httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, targetWidth, targetHeight } = body;

      if (!id) {
        return { statusCode: 400, body: 'id is required' };
      }

      const tw = targetWidth !== undefined && targetWidth !== null
        ? Number(targetWidth)
        : null;
      const th = targetHeight !== undefined && targetHeight !== null
        ? Number(targetHeight)
        : null;

      const { rows } = await db.query(
        `UPDATE game_assets
           SET target_width = $1,
               target_height = $2
         WHERE id = $3
         RETURNING *`,
        [tw, th, id]
      );

      if (rows.length === 0) {
        return { statusCode: 404, body: 'Asset not found' };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows[0])
      };
    }

    // DELETE asset
    if (httpMethod === 'DELETE') {
      const id = queryStringParameters && queryStringParameters.id;
      if (!id) {
        return { statusCode: 400, body: 'id is required' };
      }

      await db.query('DELETE FROM game_assets WHERE id = $1', [id]);

      return { statusCode: 204, body: '' };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (err) {
    console.error('assets function error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
