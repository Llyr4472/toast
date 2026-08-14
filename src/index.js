// Toast - Cloudflare Worker Entrypoint

import {
  handleRegister,
  handlePoll,
  handleSSEStream,
  handleMock,
  handleClear,
  handleExternalDnsSync
} from './api.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const hostname = url.hostname;

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || '*';
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Toast-Secret',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (pathname === '/api/register') return handleRegister(request, env);
    if (pathname === '/api/poll') return handlePoll(request, env);
    if (pathname === '/api/stream') return handleSSEStream(request, env);
    if (pathname === '/api/mock') return handleMock(request, env);
    if (pathname === '/api/clear') return handleClear(request, env);
    if (pathname === '/api/dns-sync') return handleExternalDnsSync(request, env);

    if (pathname === '/dns-query') {
      return handleDoHRequest(request, env, url);
    }

    const payloadId = extractPayloadId(url, hostname);
    if (payloadId) {
      return recordAndRespondOastHttp(request, env, payloadId, url);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Toast OAST Server Active.', { status: 200 });
  },

  async email(message, env, ctx) {
    try {
      const recipient = message.to;
      const sender = message.from;
      const headersMap = {};
      for (const [k, v] of message.headers) {
        headersMap[k] = v;
      }

      const localPart = recipient.split('@')[0] || '';
      const payloadId = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');

      const rawStream = message.raw;
      const rawText = await new Response(rawStream).text();

      const session = await env.DB.prepare(`SELECT token FROM sessions WHERE subdomain = ?`).bind(payloadId).first();
      const sessionId = session ? session.token : 'anonymous';

      const parsedData = {
        sender,
        recipient,
        subject: headersMap['subject'] || headersMap['Subject'] || '(No Subject)',
        headers: headersMap,
        body_snippet: rawText.substring(0, 4000)
      };

      await env.DB.prepare(`
        INSERT INTO interactions (session_id, payload_id, type, protocol, method, source_ip, raw_data, parsed_data)
        VALUES (?, ?, 'email', 'SMTP', 'EMAIL', ?, ?, ?)
      `).bind(sessionId, payloadId, sender, rawText, JSON.stringify(parsedData)).run();

    } catch (err) {
      console.error('Failed to parse incoming email interaction:', err);
    }
  }
};

function extractPayloadId(url, hostname) {
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const candidate = parts[0].toLowerCase();
    if (/^[a-z0-9]{4,16}$/.test(candidate) && candidate !== 'api' && candidate !== 'oast' && candidate !== 'www') {
      return candidate;
    }
  }

  const pathParts = url.pathname.split('/');
  if ((pathParts[1] === 'p' || pathParts[1] === 'payload') && pathParts[2]) {
    return pathParts[2].toLowerCase();
  }

  const param = url.searchParams.get('oast') || url.searchParams.get('payload') || url.searchParams.get('id');
  if (param && /^[a-z0-9]{4,16}$/.test(param)) {
    return param.toLowerCase();
  }

  return null;
}

async function recordAndRespondOastHttp(request, env, payloadId, url) {
  const clientIp = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const country = request.cf?.country || 'XX';
  const city = request.cf?.city || 'Unknown';
  const geo = `${country}, ${city}`;

  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }

  let bodyText = '';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    try {
      bodyText = await request.text();
    } catch (e) {
      bodyText = '[Binary Body]';
    }
  }

  const rawRequest = `${request.method} ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\n` +
    Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
    `\r\n\r\n` + bodyText;

  const parsedData = {
    method: request.method,
    url: url.toString(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers,
    body: bodyText,
    user_agent: headers['user-agent'] || '',
    cf_fingerprint: request.headers.get('cf-ray') || ''
  };

  const session = await env.DB.prepare(`SELECT token FROM sessions WHERE subdomain = ?`).bind(payloadId).first();
  const sessionId = session ? session.token : 'anonymous';

  await env.DB.prepare(`
    INSERT INTO interactions (session_id, payload_id, full_domain, type, protocol, method, source_ip, geolocation, raw_data, parsed_data)
    VALUES (?, ?, ?, 'http', ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, payloadId, url.hostname, request.headers.get('x-forwarded-proto')?.toUpperCase() || 'HTTPS', request.method, clientIp, geo, rawRequest, JSON.stringify(parsedData)).run();

  const mock = await env.DB.prepare(`SELECT * FROM mock_responses WHERE payload_id = ?`).bind(payloadId).first();

  if (mock) {
    let mockHeaders = { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' };
    try {
      if (mock.http_headers) mockHeaders = { ...mockHeaders, ...JSON.parse(mock.http_headers) };
    } catch (e) {}
    
    return new Response(mock.http_body || 'OK', {
      status: mock.http_status || 200,
      headers: mockHeaders
    });
  }

  return new Response(JSON.stringify({ status: 'success', oast_id: payloadId, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-OAST-Server': 'Toast'
    }
  });
}

async function handleDoHRequest(request, env, url) {
  const name = url.searchParams.get('name') || '';
  const type = url.searchParams.get('type') || 'A';
  const clientIp = request.headers.get('cf-connecting-ip') || '0.0.0.0';

  const payloadId = extractPayloadId(url, name);

  if (payloadId) {
    const session = await env.DB.prepare(`SELECT token FROM sessions WHERE subdomain = ?`).bind(payloadId).first();
    const sessionId = session ? session.token : 'anonymous';

    const mock = await env.DB.prepare(`SELECT dns_txt FROM mock_responses WHERE payload_id = ?`).bind(payloadId).first();
    const dnsValue = mock?.dns_txt || '127.0.0.1';

    await env.DB.prepare(`
      INSERT INTO interactions (session_id, payload_id, full_domain, type, protocol, method, source_ip, raw_data, parsed_data)
      VALUES (?, ?, ?, 'dns', 'DNS-DoH', ?, ?, ?, ?)
    `).bind(sessionId, payloadId, name, type.toUpperCase(), clientIp, `DoH Query: ${type} ${name}`, JSON.stringify({ query: name, type, client_ip: clientIp })).run();

    return new Response(JSON.stringify({
      Status: 0,
      TC: false,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      Question: [{ name, type: 1 }],
      Answer: [{ name, type: 1, TTL: 300, data: dnsValue }]
    }), {
      headers: { 'Content-Type': 'application/dns-json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  return new Response(JSON.stringify({ Status: 3, Comment: 'Name not found' }), {
    headers: { 'Content-Type': 'application/dns-json' }
  });
}
