#!/usr/bin/env node
// Toastify OAST - Command Line Client (Interactsh / Burp Collaborator CLI style)

const http = require('http');
const https = require('https');
const readline = require('readline');

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  bgDark: '\x1b[40m'
};

const serverUrl = process.env.TOASTIFY_URL || process.argv[2] || 'http://localhost:8787';

console.log(`${colors.bold}${colors.cyan}
    _____             _____  _____ _______     __  ____    A   _____ _______ 
   |_   _|           / ____||_   _|  __ \\ \\   / / / __ \\  / \\  / ____|__   __|
     | |  ___   __ _| (___    | |  | |__) \\ \\_/ / | |  | |/  \\| (___    | |   
     | | / _ \\ / _\` |\\___ \\   | |  |  ___/ \\   /  | |  | / /\\ \\\\___ \\   | |   
    _| || (_) | (_| |____) | _| |_ | |      | |   | |__| / ____ \\___) |  | |   
   |_____\\___/ \\__,_|_____/ |_____||_|      |_|    \\____/_/    \\_#####/   |_|   
${colors.reset}`);
console.log(`${colors.dim}   Toastify OAST Client v1.0.0 — Out-of-Band Security Interaction Monitor${colors.reset}\n`);

async function main() {
  try {
    console.log(`${colors.dim}[*] Registering new session with OAST server at ${serverUrl}...${colors.reset}`);
    
    const regRes = await makeRequest(`${serverUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CLI Session' })
    });

    if (!regRes.success) {
      console.error(`${colors.red}[!] Registration failed: ${regRes.error}${colors.reset}`);
      process.exit(1);
    }

    const { token, subdomain, payload_id } = regRes;
    const cleanServerHost = serverUrl.replace(/^https?:\/\//, '');

    console.log(`${colors.green}${colors.bold}[+] Session Registered Successfully!${colors.reset}`);
    console.log(`${colors.bold}====================================================${colors.reset}`);
    console.log(` Payload ID   : ${colors.bold}${colors.cyan}${payload_id}${colors.reset}`);
    console.log(` OAST Domain  : ${colors.bold}${colors.yellow}${subdomain}.${cleanServerHost}${colors.reset}`);
    console.log(` HTTP Payload : ${colors.yellow}http://${subdomain}.${cleanServerHost}${colors.reset}`);
    console.log(` Log4j Payload: ${colors.yellow}\${jndi:ldap://${subdomain}.${cleanServerHost}/a}${colors.reset}`);
    console.log(` Email Payload: ${colors.yellow}callback@${subdomain}.${cleanServerHost}${colors.reset}`);
    console.log(` Session Token: ${colors.dim}${token}${colors.reset}`);
    console.log(`${colors.bold}====================================================${colors.reset}`);
    console.log(`${colors.dim}[*] Listening for incoming out-of-band interactions (Ctrl+C to quit)...${colors.reset}\n`);

    let lastId = 0;

    // Start Polling Loop
    setInterval(async () => {
      try {
        const pollRes = await makeRequest(`${serverUrl}/api/poll?token=${token}&since_id=${lastId}`);
        if (pollRes.success && pollRes.interactions.length > 0) {
          pollRes.interactions.forEach(item => {
            lastId = Math.max(lastId, item.id);
            printInteraction(item);
          });
        }
      } catch (e) {
        // Silent poll error
      }
    }, 2000);

  } catch (err) {
    console.error(`${colors.red}[!] Error connecting to server: ${err.message}${colors.reset}`);
  }
}

function printInteraction(item) {
  const timestamp = new Date(item.created_at || Date.now()).toLocaleTimeString();
  let typeColor = colors.green;
  if (item.type === 'dns') typeColor = colors.yellow;
  if (item.type === 'email') typeColor = colors.magenta;

  console.log(`${colors.bold}[${timestamp}] ${typeColor}[${(item.type || 'HTTP').toUpperCase()}]${colors.reset} Interaction detected!`);
  console.log(`  ├── Source IP   : ${colors.bold}${item.source_ip || '0.0.0.0'}${colors.reset} (${item.geolocation || 'Unknown'})`);
  console.log(`  ├── Protocol    : ${item.protocol || 'HTTP/1.1'}`);
  console.log(`  ├── Method/Type : ${item.method || 'GET'}`);
  
  if (item.parsed_data) {
    if (item.type === 'email') {
      console.log(`  ├── Sender      : ${item.parsed_data.sender || 'Unknown'}`);
      console.log(`  └── Subject     : ${item.parsed_data.subject || '(No Subject)'}`);
    } else if (item.parsed_data.url) {
      console.log(`  └── URL Path    : ${item.parsed_data.url}`);
    }
  }
  console.log('');
}

function makeRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

main();
