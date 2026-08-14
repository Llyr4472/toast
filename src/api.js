// Toast - API & Interaction Handler

export async function handleRegister(request, env) {
  try {
    const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
    
    // Rate limit: Max 100 session registrations per hour globally
    const recentRegs = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM sessions WHERE created_at > datetime('now', '-1 hour')`
    ).first();

    if (recentRegs && recentRegs.count > 100) {
      return jsonResponse({ error: 'Global registration rate limit reached. Try again later.' }, 429, request);
    }

    const body = await request.json().catch(() => ({}));
    const sessionName = (body.name || 'OAST Session').substring(0, 50);
    const idLen = (body.short || body.length === 4) ? 4 : 8;
    
    // Configurable duration: Default 48 hrs, Min 1 hr, Max 168 hrs (7 days)
    const hours = Math.min(Math.max(parseInt(body.hours || body.duration_hours || 48, 10), 1), 168);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    // Auto-cleanup expired sessions
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`).run().catch(() => {});

    const token = 's_' + crypto.randomUUID().replace(/-/g, '');
    const payloadId = Math.random().toString(36).substring(2, 2 + idLen);
    
    await env.DB.prepare(
      `INSERT INTO sessions (token, subdomain, name, expires_at) VALUES (?, ?, ?, ?)`
    ).bind(token, payloadId, sessionName, expiresAt).run();

    return jsonResponse({
      success: true,
      token,
      payload_id: payloadId,
      subdomain: payloadId,
      expires_at: expiresAt
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: 'Failed to register session: ' + err.message }, 500, request);
  }
}

export async function handlePoll(request, env) {
  const url = new URL(request.url);
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') || url.searchParams.get('token');
  const lastId = parseInt(url.searchParams.get('since_id') || '0', 10);
  
  if (!token) {
    return jsonResponse({ error: 'Missing session token' }, 401);
  }

  try {
    const session = await env.DB.prepare(
      `SELECT * FROM sessions WHERE token = ?`
    ).bind(token).first();

    if (!session) {
      return jsonResponse({ error: 'Invalid or expired session token' }, 404);
    }

    const { results } = await env.DB.prepare(
      `SELECT * FROM interactions WHERE session_id = ? AND id > ? ORDER BY id ASC LIMIT 200`
    ).bind(token, lastId).all();

    const parsedResults = results.map(row => {
      let parsed = {};
      try {
        parsed = JSON.parse(row.parsed_data || '{}');
      } catch (e) {
        parsed = { text: row.parsed_data };
      }
      return {
        ...row,
        parsed_data: parsed
      };
    });

    return jsonResponse({
      success: true,
      subdomain: session.subdomain,
      interactions: parsedResults
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to fetch logs: ' + err.message }, 500);
  }
}

export async function handleSSEStream(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Unauthorized: Missing token', { status: 401 });
  }

  let timerId = null;
  let lastId = parseInt(url.searchParams.get('since_id') || '0', 10);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: connected\ndata: {"status":"connected"}\n\n`));

      timerId = setInterval(async () => {
        try {
          const { results } = await env.DB.prepare(
            `SELECT * FROM interactions WHERE session_id = ? AND id > ? ORDER BY id ASC LIMIT 50`
          ).bind(token, lastId).all();

          if (results && results.length > 0) {
            for (const item of results) {
              lastId = item.id;
              let parsed = {};
              try { parsed = JSON.parse(item.parsed_data); } catch (e) {}
              const eventPayload = JSON.stringify({ ...item, parsed_data: parsed });
              controller.enqueue(encoder.encode(`event: interaction\ndata: ${eventPayload}\n\n`));
            }
          } else {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch (err) {}
      }, 2000);
    },
    cancel() {
      if (timerId) clearInterval(timerId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export async function handleMock(request, env) {
  const url = new URL(request.url);
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') || url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing session token' }, 401);
  }

  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE token = ?`).bind(token).first();
  if (!session) {
    return jsonResponse({ error: 'Session not found' }, 404);
  }

  if (request.method === 'GET') {
    const mock = await env.DB.prepare(`SELECT * FROM mock_responses WHERE session_id = ?`).bind(token).first();
    return jsonResponse({ success: true, mock: mock || null });
  }

  if (request.method === 'POST') {
    try {
      const data = await request.json();
      const status = parseInt(data.http_status || '200', 10);
      const headers = typeof data.http_headers === 'string' ? data.http_headers : JSON.stringify(data.http_headers || {});
      const body = data.http_body ?? 'OK';
      const dnsTxt = data.dns_txt ?? '';

      await env.DB.prepare(`
        INSERT INTO mock_responses (session_id, payload_id, http_status, http_headers, http_body, dns_txt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(payload_id) DO UPDATE SET
          http_status=excluded.http_status,
          http_headers=excluded.http_headers,
          http_body=excluded.http_body,
          dns_txt=excluded.dns_txt
      `).bind(token, session.subdomain, status, headers, body, dnsTxt).run();

      return jsonResponse({ success: true, message: 'Mock response updated' });
    } catch (err) {
      return jsonResponse({ error: 'Failed to update mock: ' + err.message }, 500);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

export async function handleClear(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') || new URL(request.url).searchParams.get('token');
  if (!token) return jsonResponse({ error: 'Missing session token' }, 401);

  await env.DB.prepare(`DELETE FROM interactions WHERE session_id = ?`).bind(token).run();
  return jsonResponse({ success: true, message: 'Logs cleared' });
}

export async function handleExternalDnsSync(request, env) {
  const secretKey = request.headers.get('X-Toast-Secret');
  const expectedSecret = env.DNS_SYNC_SECRET || 'toast-default-secret';

  if (secretKey !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized DNS Sync' }, 401);
  }

  try {
    const { payload_id, type, method, source_ip, raw_data, parsed_data } = await request.json();

    const session = await env.DB.prepare(`SELECT token FROM sessions WHERE subdomain = ?`).bind(payload_id).first();
    const sessionId = session ? session.token : 'anonymous';

    await env.DB.prepare(`
      INSERT INTO interactions (session_id, payload_id, type, protocol, method, source_ip, raw_data, parsed_data)
      VALUES (?, ?, 'dns', 'DNS-UDP', ?, ?, ?, ?)
    `).bind(sessionId, payload_id, method || 'A', source_ip || '0.0.0.0', raw_data || '', JSON.stringify(parsed_data || {})).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(data, status = 200, request = null) {
  const origin = request ? (request.headers.get('Origin') || '*') : '*';
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Toast-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    }
  });
}
