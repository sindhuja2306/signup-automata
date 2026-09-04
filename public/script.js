// @ts-nocheck
// Connect to socket.io with explicit URL
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// DOM elements
const referralInput = document.getElementById('referralCode');
const targetInput = document.getElementById('targetSignups');
const startPhoneInput = document.getElementById('startPhone');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const clearResultsBtn = document.getElementById('clearResultsBtn');
const logContainer = document.getElementById('logContainer');

const statusEl = document.getElementById('status');
const currentReferralEl = document.getElementById('currentReferral');
const successfulEl = document.getElementById('successful');
const failedEl = document.getElementById('failed');
const currentPhoneEl = document.getElementById('currentPhone');
const progressTextEl = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');

// Socket connection status
socket.on('connect', () => {
  console.log('✅ Connected to server');
  addLog('success', '✅ Connected to server');
  checkStatus();
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  addLog('error', '❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  addLog('error', `❌ Connection error: ${error.message}`);
});

// Start automation
startBtn.addEventListener('click', async () => {
  const referralCode = referralInput.value.trim();
  const targetSignups = parseInt(targetInput.value) || 1000;
  const startPhone = startPhoneInput.value.trim() || '5000000001';

  if (!referralCode) {
    addLog('error', '❌ Enter referral code');
    referralInput.focus();
    return;
  }

  try {
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Starting...';
    addLog('info', `🔄 Starting automation for ${referralCode}...`);
    
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCode, targetSignups, startPhone })
    });
    
    const data = await res.json();
    
    if (data.success) {
      addLog('success', `✅ Started: ${referralCode}`);
      addLog('info', `📱 Starting phone: ${startPhone}`);
      addLog('info', `🎯 Target: ${targetSignups} signups`);
    } else {
      addLog('error', `❌ ${data.error}`);
      startBtn.disabled = false;
      startBtn.textContent = '🚀 Start';
    }
  } catch (error) {
    addLog('error', `❌ ${error.message}`);
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Start';
  }
});

// Stop automation
stopBtn.addEventListener('click', async () => {
  try {
    addLog('warning', '⏹️ Stopping automation...');
    const res = await fetch('/api/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      addLog('warning', '⏹️ Stopped by user');
    } else {
      addLog('error', `❌ ${data.error}`);
    }
  } catch (error) {
    addLog('error', `❌ ${error.message}`);
  }
});

// Clear logs
clearBtn.addEventListener('click', () => {
  logContainer.innerHTML = '';
  addLog('info', '🗑️ Logs cleared');
});

// Clear results
clearResultsBtn.addEventListener('click', async () => {
  if (!confirm('Clear all results?')) return;
  try {
    await fetch('/api/clear-results', { method: 'POST' });
    addLog('info', '📊 Results cleared');
    successfulEl.textContent = '0';
    failedEl.textContent = '0';
  } catch (error) {
    addLog('error', `❌ ${error.message}`);
  }
});

// Socket events
socket.on('progress', (stats) => {
  console.log('📊 Progress update:', stats);
  updateUI(stats);
});

socket.on('log', (data) => {
  console.log('📝 Log:', data);
  addLog(data.type || 'info', data.message);
});

socket.on('complete', (data) => {
  console.log('✅ Complete:', data);
  addLog('success', `✅ Complete! ${data.stats.successful} successful`);
  addLog('info', `📊 Failed: ${data.stats.failed}`);
  toggleButtons(false);
  startBtn.textContent = '🚀 Start';
});

socket.on('stopped', (data) => {
  console.log('⏹️ Stopped:', data);
  addLog('warning', `⏹️ ${data.message}`);
  toggleButtons(false);
  startBtn.textContent = '🚀 Start';
});

// Update UI
function updateUI(stats) {
  if (!stats) return;
  
  if (stats.isRunning) {
    statusEl.textContent = '● Running';
    statusEl.className = 'stat-value status-running';
    toggleButtons(true);
  } else if (stats.successful >= stats.target && stats.target > 0) {
    statusEl.textContent = 'Completed';
    statusEl.className = 'stat-value status-completed';
    toggleButtons(false);
    startBtn.textContent = '🚀 Start';
  } else {
    statusEl.textContent = 'Idle';
    statusEl.className = 'stat-value status-idle';
    toggleButtons(false);
    startBtn.textContent = '🚀 Start';
  }

  currentReferralEl.textContent = stats.referralCode || '-';
  successfulEl.textContent = stats.successful || 0;
  failedEl.textContent = stats.failed || 0;
  currentPhoneEl.textContent = stats.currentPhone || '-';

  const progress = Math.min(stats.progress || 0, 100);
  progressTextEl.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  progressBar.textContent = `${progress}%`;
}

function toggleButtons(running) {
  if (running) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    startBtn.disabled = true;
  } else {
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    startBtn.disabled = false;
  }
}

function addLog(type, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Keep only last 500 logs
  while (logContainer.children.length > 500) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// Check status on load
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'running') {
      updateUI(data.stats);
      toggleButtons(true);
      addLog('info', '🔄 Automation already running');
    }
  } catch (error) {
    console.error('Error checking status:', error);
  }
}

// Initial setup
addLog('info', '💡 Enter referral code and click Start');
addLog('info', '🔌 Waiting for server connection...');

// Keyboard shortcuts
referralInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startBtn.click();
});

targetInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startBtn.click();
});

startPhoneInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startBtn.click();
});