// Toast - Standalone Raw UDP 53 DNS Daemon

const dgram = require('dgram');
const http = require('http');
const https = require('https');

const DNS_PORT = process.env.DNS_PORT || 53;
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const DNS_SECRET = process.env.DNS_SECRET || 'toast-default-secret';

const server = dgram.createSocket('udp4');

console.log(`[+] Toast DNS Daemon listening on port ${DNS_PORT}`);
console.log(`[*] Forwarding interactions to Worker: ${WORKER_URL}`);

server.on('message', async (msg, rinfo) => {
  try {
    const parsedDns = parseDnsPacket(msg);
    if (!parsedDns || !parsedDns.name) return;

    console.log(`[DNS Query] Type: ${parsedDns.type} | Name: ${parsedDns.name} | From: ${rinfo.address}`);

    const parts = parsedDns.name.split('.');
    const payloadId = parts[0]?.toLowerCase();

    if (payloadId && /^[a-z0-9]{6,16}$/.test(payloadId)) {
      syncDnsToWorker({
        payload_id: payloadId,
        type: 'dns',
        method: parsedDns.type,
        source_ip: rinfo.address,
        raw_data: `UDP 53 Query: ${parsedDns.type} ${parsedDns.name}`,
        parsed_data: { domain: parsedDns.name, record_type: parsedDns.type, client_port: rinfo.port }
      });
    }

    const response = buildDnsResponse(msg, parsedDns);
    server.send(response, rinfo.port, rinfo.address);

  } catch (err) {
    console.error('[-] Error handling DNS packet:', err.message);
  }
});

server.on('listening', () => {
  const address = server.address();
  console.log(`[+] DNS Server active on ${address.address}:${address.port}`);
});

server.bind(DNS_PORT);

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

function buildDnsResponse(queryBuf, parsed) {
  const res = Buffer.from(queryBuf);
  res[2] = 0x81;
  res[3] = 0x80;
  res[6] = 0x00;
  res[7] = 0x01;

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
      'X-Toast-Secret': DNS_SECRET
    }
  });

  req.on('error', () => {});
  req.write(JSON.stringify(data));
  req.end();
}
