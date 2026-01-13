// functions/build-sprite.js
const db = require('./db');
const sharp = require('sharp');
const https = require('https');
const cloudinary = require('cloudinary').v2;

// Let the SDK read CLOUDINARY_URL from env
// CLOUDINARY_URL should look like: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
cloudinary.config();

/**
 * Download a remote image into a Buffer
 */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

/**
 * Upload the sprite buffer to Cloudinary as PNG
 */
function uploadSpriteToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'casino-sprites',
      public_id: publicId,
      overwrite: true,
      format: 'png',
      resource_type: 'image'
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

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
        statusCode: 400,
        body: 'No assets for this game'
      };
    }

    // 3. Prepare tiles with target sizes and processed URLs
    const tiles = assets.map((a) => {
      const tw = a.target_width || a.width;
      const th = a.target_height || a.height;
      const meta = a.metadata || {};
      const publicId = meta.public_id;
      if (!publicId || !a.format) {
        throw new Error(`Asset ${a.id} is missing public_id or format`);
      }

      const u = new URL(a.url);
      const parts = u.pathname.split('/'); // ['', cloud, 'image', 'upload', ...]
      const cloudName = parts[1];

      const processedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_${tw},h_${th},c_fit/${publicId}.${a.format}`;

      return {
        id: a.id,
        label: a.label,
        width: tw,
        height: th,
        processedUrl
      };
    });

    // 4. Determine grid layout (simple near-square grid)
    const maxW = Math.max(...tiles.map((t) => t.width));
    const maxH = Math.max(...tiles.map((t) => t.height));
    const cellWidth = maxW;
    const cellHeight = maxH;

    const n = tiles.length;
    const columns = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / columns);

    const sheetWidth = columns * cellWidth;
    const sheetHeight = rows * cellHeight;

    // 5. Download all tile images in parallel
    const buffers = await Promise.all(
      tiles.map((t) => fetchBuffer(t.processedUrl))
    );

    // 6. Prepare composites and frames mapping
    const composites = [];
    const frames = {};

    tiles.forEach((tile, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = col * cellWidth;
      const y = row * cellHeight;

      composites.push({
        input: buffers[index],
        left: x,
        top: y
      });

      frames[tile.label] = {
        x,
        y,
        w: tile.width,
        h: tile.height
      };
    });

    // 7. Compose sprite sheet with sharp
    const base = sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    const sheetBuffer = await base.composite(composites).png().toBuffer();

    // 8. Upload sprite PNG to Cloudinary
    const publicId = `sprite_${game.code}`;
    const uploadResult = await uploadSpriteToCloudinary(sheetBuffer, publicId);

    const sheetUrl = uploadResult.secure_url;

    const payload = {
      gameId: game.id,
      gameCode: game.code,
      name: game.name,
      description: game.description,
      sprite: {
        url: sheetUrl,
        width: sheetWidth,
        height: sheetHeight,
        cellWidth,
        cellHeight
      },
      builtAt: new Date().toISOString(),
      frames
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload, null, 2)
    };
  } catch (err) {
    console.error('build-sprite error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: err.message || err })
    };
  }
};
