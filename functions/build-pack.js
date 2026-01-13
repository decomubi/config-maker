// functions/build-pack.js
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

    // 1. Load game
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

    // 2. Load assets
    const assetRes = await db.query(
      `SELECT id, label, url, width, height, format, target_width, target_height, metadata
         FROM game_assets
        WHERE game_id = $1
        ORDER BY created_at`,
      [game.id]
    );
    const assets = assetRes.rows;

    if (assets.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          gameCode: game.code,
          name: game.name,
          description: game.description,
          config: game.config,
          builtAt: new Date().toISOString(),
          assets: []
        }, null, 2)
      };
    }

    // 3. Build processed URLs
    const processedAssets = assets.map((a) => {
      const tw = a.target_width || a.width;
      const th = a.target_height || a.height;

      const meta = a.metadata || {};
      const publicId = meta.public_id;

      let processedUrl = a.url;
      if (publicId && a.format && tw && th) {
        const u = new URL(a.url);
        const parts = u.pathname.split('/'); // ['', cloud, 'image', 'upload', ...]
        const cloudName = parts[1];

        processedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_${tw},h_${th},c_fit/${publicId}.${a.format}`;
      }

      return {
        id: a.id,
        label: a.label,
        original: {
          url: a.url,
          width: a.width,
          height: a.height,
          format: a.format
        },
        target: {
          width: tw,
          height: th
        },
        processed: {
          url: processedUrl
        }
      };
    });

    const payload = {
      gameId: game.id,
      gameCode: game.code,
      name: game.name,
      description: game.description,
      config: game.config,
      builtAt: new Date().toISOString(),
      assets: processedAssets
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload, null, 2)
    };
  } catch (err) {
    console.error('build-pack error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
