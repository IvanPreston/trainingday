const https = require('https');

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch(e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Невалидный JSON: ' + e.message }) };
    }

    const { prompt } = body;
    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Нет промпта' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API ключ не настроен на сервере' }) };
    }

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }]
    });

    // Используем встроенный https модуль Node.js вместо fetch
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch(e) {
            reject(new Error('Ошибка парсинга ответа API: ' + data.slice(0, 200)));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(85000, () => {
        req.destroy();
        reject(new Error('Таймаут запроса к API'));
      });
      req.write(requestBody);
      req.end();
    });

    if (result.status !== 200) {
      const errMsg = result.body.error ? result.body.error.message : 'Ошибка API ' + result.status;
      return { statusCode: result.status, headers, body: JSON.stringify({ error: errMsg }) };
    }

    if (!result.body.content || !result.body.content[0]) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Пустой ответ от Claude' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content: result.body.content[0].text })
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
