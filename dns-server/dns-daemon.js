// Toastify OAST - Optional Standalone Raw UDP 53 DNS Server Daemon
// Run this daemon on any free VPS (Oracle Free, Render, Fly.io, etc.) to capture native UDP 53 DNS queries!

const dgram = require('dgram');
const http = require('http');
const https = require('https');

const DNS_PORT = process.env.DNS_PORT || 53;
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const DNS_SECRET = process.env.DNS_SECRET || 'toastify-default-secret';

const server = dgram.createSocket('udp4');

console.log(`[+] Toastify UDP DNS Daemon starting on port ${DNS_PORT}...`);
console.log(`[*] Forwarding captured DNS interactions to Worker at: ${WORKER_URL}`);

server.on('message', async (msg, rinfo) => {
  try {
    const parsedDns = parseDnsPacket(msg);
    if (!parsedDns || !parsedDns.name) return;

    console.log(`[DNS Query] Type: ${parsedDns.type} | Name: ${parsedDns.name} | From: ${rinfo.address}`);

    // Extract payload_id from subdomain (e.g., "c94a2b1f.oast.mydomain.com")
    const parts = parsedDns.name.split('.');
    const payloadId = parts[0]?.toLowerCase();

    if (payloadId && /^[a-z0-9]{6,16}$/.test(payloadId)) {
      // Post captured DNS query to Cloudflare Worker API
      syncDnsToWorker({
        payload_id: payloadId,
        type: 'dns',
        method: parsedDns.type,
        source_ip: rinfo.address,
        raw_data: `UDP 53 Query: ${parsedDns.type} ${parsedDns.name}`,
        parsed_data: { domain: parsedDns.name, record_type: parsedDns.type, client_port: rinfo.port }
      });
    }

    // Send minimal valid DNS response (A record 127.0.0.1)
    const response = buildDnsResponse(msg, parsedDns);
    server.send(response, rinfo.port, rinfo.address);

  } catch (err) {
    console.error('[-] Error handling DNS packet:', err.message);
  }
});

server.on('listening', () => {
  const address = server.address();
  console.log(`[+] DNS Server listening on ${address.address}:${address.port}`);
});

server.bind(DNS_PORT);

// Minimal DNS Packet Parser for A, AAAA, TXT, MX
function parseDnsPacket(buf) {
  if (buf.length < 12) return null;
  
  let offset = 12;
  let domainParts = [];
  
  while (offset < buf.length) {
    const len = buf[offset];
    if (len === 0) { offset++; break; }
    if ((len & 0xc0) === 0xc0) { offset += 2; break; }
    
    offset++;
    domainParts.push(buf.toString('utf8', offset, offset + len));
    offset += len;
  }

  const name = domainParts.join('.');
  const typeCode = buf.readUInt16BE(offset);
  
  const typeMap = { 1: 'A', 28: 'AAAA', 16: 'TXT', 15: 'MX', 5: 'CNAME', 12: 'PTR' };
  const type = typeMap[typeCode] || `TYPE_${typeCode}`;

  return { name, type };
}

// Minimal DNS Response builder
function buildDnsResponse(queryBuf, parsed) {
  const res = Buffer.from(queryBuf);
  // Set QR bit (response), RA bit (recursion available)
  res[2] = 0x81;
  res[3] = 0x80;
  // Answer count = 1
  res[6] = 0x00;
  res[7] = 0x01;

  // Append Answer section: Pointer to QNAME (0xc00c), Type A (0x0001), Class IN (0x0001), TTL 60 (0x0000003c), Data length 4 (0x0004), IP 127.0.0.1
  const answer = Buffer.from([
    0xc0, 0x0c,
    0x00, 0x01,
    0x00, 0x01,
    0x00, 0x00, 0x00, 0x3c,
    0x00, 0x04,
    127, 0, 0, 1
  ]);

  return Buffer.concat([res, answer]);
}

function syncDnsToWorker(data) {
  const url = new URL(`${WORKER_URL}/api/dns-sync`);
  const lib = url.protocol === 'https:' ? https : http;
  
  const req = lib.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Toastify-Secret': DNS_SECRET
    }
  });

  req.on('error', () => {});
  req.write(JSON.stringify(data));
  req.end();
}
