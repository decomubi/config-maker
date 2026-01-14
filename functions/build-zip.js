// functions/build-zip.js
const JSZip = require('jszip');
const https = require('https');
const buildPack = require('./build-pack');
const buildSprite = require('./build-sprite');

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

    const qs = code ? { code } : { id };

    const packRes = await buildPack.handler({
      httpMethod: 'GET',
      queryStringParameters: qs
    });
    if (packRes.statusCode !== 200) return packRes;
    const packData = JSON.parse(packRes.body);

    const spriteRes = await buildSprite.handler({
      httpMethod: 'GET',
      queryStringParameters: qs
    });
    if (spriteRes.statusCode !== 200) return spriteRes;
    const spriteData = JSON.parse(spriteRes.body);

    const gameCode =
      packData.gameCode || spriteData.gameCode || code || 'game';

    const zip = new JSZip();

    zip.file(`pack_${gameCode}.json`, JSON.stringify(packData, null, 2));
    zip.file(`sprite_${gameCode}.json`, JSON.stringify(spriteData, null, 2));

    const spriteUrl = spriteData.sprite && spriteData.sprite.url;
    if (!spriteUrl) throw new Error('Sprite URL missing in sprite data');

    const pngBuffer = await fetchBuffer(spriteUrl);
    zip.file(`sprite_${gameCode}.png`, pngBuffer);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="game_pack_${gameCode}.zip"`
      },
      body: zipBuffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('build-zip error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', details: err.message || err })
    };
  }
};
