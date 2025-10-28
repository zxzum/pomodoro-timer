const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class PomodoroTimer {
  constructor() {
    this.timeLeft = 0;
    this.isRunning = false;
    this.isWorkSession = true;
    this.sessionsCompleted = 0;
    this.timer = null;
    this.statusBar = null;
    this.panel = null;
    this.lastUpdateTime = Date.now();
  }

  activate(context) {
    this.context = context;
    this.createStatusBar();
    this.registerCommands();
    this.registerConfigWatcher();
    this.updateStatusBar();
  }

  createStatusBar() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBar.command = 'pomodoroTimer.toggleTimer';
    this.statusBar.show();
  }

  registerCommands() {
    const toggleCommand = vscode.commands.registerCommand(
      'pomodoroTimer.toggleTimer',
      () => this.toggleTimer()
    );

    const panelCommand = vscode.commands.registerCommand(
      'pomodoroTimer.showPanel',
      () => this.showPanel()
    );

    this.context.subscriptions.push(toggleCommand, panelCommand, this.statusBar);
  }

  registerConfigWatcher() {
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pomodoroTimer')) {
        this.broadcastUpdate();
      }
    });
  }

  toggleTimer() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (this.isRunning) return;

    const config = vscode.workspace.getConfiguration('pomodoroTimer');
    const workDuration = config.get('workDuration', 25);
    const breakDuration = config.get('breakDuration', 5);
    const longBreakDuration = config.get('longBreakDuration', 15);
    const sessionsBeforeLongBreak = config.get('sessionsBeforeLongBreak', 4);

    if (this.timeLeft === 0) {
      const isLongBreak = 
        !this.isWorkSession && 
        this.sessionsCompleted > 0 && 
        this.sessionsCompleted % sessionsBeforeLongBreak === 0;

      if (this.isWorkSession) {
        this.timeLeft = workDuration * 60;
      } else {
        this.timeLeft = isLongBreak ? longBreakDuration * 60 : breakDuration * 60;
      }
    }

    this.isRunning = true;
    this.lastUpdateTime = Date.now();
    this.timer = setInterval(() => this.tick(), 100);
    this.updateStatusBar();
    this.broadcastUpdate();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.isRunning = false;
    this.updateStatusBar();
    this.broadcastUpdate();
  }

  reset() {
    this.stop();
    this.timeLeft = 0;
    this.isWorkSession = true;
    this.sessionsCompleted = 0;
    this.updateStatusBar();
    this.broadcastUpdate();
  }

  tick() {
    const now = Date.now();
    const elapsed = Math.floor((now - this.lastUpdateTime) / 1000);
    
    if (elapsed >= 1) {
      this.timeLeft -= elapsed;
      this.lastUpdateTime = now;

      if (this.timeLeft <= 0) {
        this.onTimerEnd();
        return;
      }

      this.updateStatusBar();
      this.broadcastUpdate();
    }
  }

  onTimerEnd() {
    this.stop();
    const config = vscode.workspace.getConfiguration('pomodoroTimer');

    if (this.isWorkSession) {
      this.sessionsCompleted++;
      this.playNotification('Work session completed!', config);
      this.isWorkSession = false;
      this.timeLeft = 0;
    } else {
      this.playNotification('Break time over, ready to work!', config);
      this.isWorkSession = true;
      this.timeLeft = 0;
    }

    this.updateStatusBar();
    this.broadcastUpdate();
  }

  playNotification(message, config) {
    if (config.get('soundEnabled', true)) {
      this.beep();
    }

    if (config.get('notificationEnabled', true)) {
      vscode.window.showInformationMessage(`🍅 ${message}`);
    }
  }

  beep() {
    try {
      const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log('Audio context not available');
    }
  }

  updateStatusBar() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const icon = this.isWorkSession ? '🍅' : '☕';
    const status = this.isRunning ? '●' : '○';
    const sessionType = this.isWorkSession ? 'Work' : 'Break';

    this.statusBar.text = `${icon} ${sessionType} ${timeStr} ${status}`;
    this.statusBar.tooltip = `Sessions completed: ${this.sessionsCompleted}`;
  }

  showPanel() {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'pomodoroPanel',
        'Pomodoro Timer',
        vscode.ViewColumn.Two,
        { 
          enableScripts: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });

      this.panel.webview.onDidReceiveMessage((message) => {
        this.handleWebviewMessage(message);
      });

      this.panel.webview.html = this.getWebviewContent();
    }

    this.panel.reveal();
    this.broadcastUpdate();
  }

  handleWebviewMessage(message) {
    switch (message.command) {
      case 'start':
        this.start();
        break;
      case 'stop':
        this.stop();
        break;
      case 'reset':
        this.reset();
        break;
      case 'updateSettings':
        this.updateSettings(message.settings);
        break;
    }
  }

  updateSettings(settings) {
    const config = vscode.workspace.getConfiguration('pomodoroTimer');
    for (const [key, value] of Object.entries(settings)) {
      const settingKey = key.replace('pomodoroTimer.', '');
      config.update(settingKey, value, vscode.ConfigurationTarget.Global);
    }
  }

  broadcastUpdate() {
    if (this.panel && this.panel.visible) {
      const config = vscode.workspace.getConfiguration('pomodoroTimer');
      this.panel.webview.postMessage({
        command: 'update',
        state: {
          isRunning: this.isRunning,
          isWorkSession: this.isWorkSession,
          timeLeft: this.timeLeft,
          sessionsCompleted: this.sessionsCompleted,
          workDuration: config.get('workDuration', 25),
          breakDuration: config.get('breakDuration', 5),
          longBreakDuration: config.get('longBreakDuration', 15),
          sessionsBeforeLongBreak: config.get('sessionsBeforeLongBreak', 4),
          soundEnabled: config.get('soundEnabled', true),
          notificationEnabled: config.get('notificationEnabled', true),
        }
      });
    }
  }

  getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pomodoro Timer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }

    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 30px;
      max-width: 450px;
      margin: 0 auto;
    }

    .timer-display {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #f0f0f0;
    }

    .session-type {
      font-size: 16px;
      color: #667eea;
      margin-bottom: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .time {
      font-size: 80px;
      font-weight: 700;
      color: #333;
      font-family: 'Monaco', 'Menlo', monospace;
      letter-spacing: 2px;
      line-height: 1;
    }

    .sessions-info {
      font-size: 13px;
      color: #999;
      margin-top: 12px;
    }

    .sessions-info strong {
      color: #667eea;
      font-weight: 600;
    }

    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
      justify-content: center;
    }

    button {
      padding: 12px 24px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      flex: 1;
      max-width: 120px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }

    .btn-primary:active {
      transform: translateY(0);
    }

    .btn-secondary {
      background: #f5f5f5;
      color: #333;
      border: 1px solid #e0e0e0;
    }

    .btn-secondary:hover {
      background: #efefef;
      border-color: #d0d0d0;
    }

    .btn-secondary:active {
      background: #e5e5e5;
    }

    .settings {
      border-top: 2px solid #f0f0f0;
      padding-top: 20px;
    }

    .settings h3 {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .setting-group {
      margin-bottom: 18px;
    }

    .setting-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .setting-label label {
      font-size: 13px;
      font-weight: 500;
      color: #333;
    }

    .setting-value {
      font-weight: 600;
      color: #667eea;
      min-width: 30px;
      text-align: right;
    }

    .slider {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: #e0e0e0;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
    }

    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    .slider::-webkit-slider-thumb:hover {
      background: #764ba2;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    .slider::-moz-range-thumb:hover {
      background: #764ba2;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .toggle-group {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .toggle {
      width: 50px;
      height: 28px;
      background: #ddd;
      border-radius: 14px;
      cursor: pointer;
      position: relative;
      transition: background 0.3s ease;
      flex-shrink: 0;
    }

    .toggle.active {
      background: #667eea;
    }

    .toggle-ball {
      width: 24px;
      height: 24px;
      background: white;
      border-radius: 12px;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: left 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .toggle.active .toggle-ball {
      left: 24px;
    }

    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
      animation: pulse 2s infinite;
    }

    .status-indicator.running {
      background: #4CAF50;
    }

    .status-indicator.stopped {
      background: #999;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    @media (prefers-color-scheme: dark) {
      .container {
        background: #1e1e1e;
        color: #e0e0e0;
      }

      .timer-display {
        border-bottom-color: #333;
      }

      .time {
        color: #e0e0e0;
      }

      .btn-secondary {
        background: #2d2d2d;
        color: #e0e0e0;
        border-color: #3d3d3d;
      }

      .btn-secondary:hover {
        background: #333;
        border-color: #444;
      }

      .settings {
        border-top-color: #333;
      }

      .settings h3 {
        color: #e0e0e0;
      }

      .setting-label label {
        color: #e0e0e0;
      }

      .slider {
        background: #333;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="timer-display">
      <div class="session-type">
        <span class="status-indicator stopped" id="statusIndicator"></span>
        <span id="sessionType">Work Session</span>
      </div>
      <div class="time" id="time">25:00</div>
      <div class="sessions-info">
        Sessions completed: <strong id="sessionsCount">0</strong>
      </div>
    </div>

    <div class="controls">
      <button class="btn-primary" id="startBtn">Start</button>
      <button class="btn-secondary" id="stopBtn">Stop</button>
      <button class="btn-secondary" id="resetBtn">Reset</button>
    </div>

    <div class="settings">
      <h3>Settings</h3>
      
      <div class="setting-group">
        <div class="setting-label">
          <label>Work Duration (min)</label>
          <span class="setting-value" id="workValue">25</span>
        </div>
        <input type="range" id="workDuration" min="1" max="60" value="25" class="slider">
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <label>Break Duration (min)</label>
          <span class="setting-value" id="breakValue">5</span>
        </div>
        <input type="range" id="breakDuration" min="1" max="30" value="5" class="slider">
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <label>Long Break Duration (min)</label>
          <span class="setting-value" id="longBreakValue">15</span>
        </div>
        <input type="range" id="longBreakDuration" min="1" max="60" value="15" class="slider">
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <label>Sessions Before Long Break</label>
          <span class="setting-value" id="sessionsValue">4</span>
        </div>
        <input type="range" id="sessionsBeforeLongBreak" min="1" max="10" value="4" class="slider">
      </div>

      <div class="setting-group toggle-group">
        <label>Sound Notifications</label>
        <div class="toggle active" id="soundToggle">
          <div class="toggle-ball"></div>
        </div>
      </div>

      <div class="setting-group toggle-group">
        <label>Desktop Notifications</label>
        <div class="toggle active" id="notificationToggle">
          <div class="toggle-ball"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let state = {
      isRunning: false,
      isWorkSession: true,
      timeLeft: 0,
      sessionsCompleted: 0,
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4,
      soundEnabled: true,
      notificationEnabled: true,
    };

    const elements = {
      time: document.getElementById('time'),
      sessionType: document.getElementById('sessionType'),
      sessionsCount: document.getElementById('sessionsCount'),
      statusIndicator: document.getElementById('statusIndicator'),
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      resetBtn: document.getElementById('resetBtn'),
      workDuration: document.getElementById('workDuration'),
      breakDuration: document.getElementById('breakDuration'),
      longBreakDuration: document.getElementById('longBreakDuration'),
      sessionsBeforeLongBreak: document.getElementById('sessionsBeforeLongBreak'),
      workValue: document.getElementById('workValue'),
      breakValue: document.getElementById('breakValue'),
      longBreakValue: document.getElementById('longBreakValue'),
      sessionsValue: document.getElementById('sessionsValue'),
      soundToggle: document.getElementById('soundToggle'),
      notificationToggle: document.getElementById('notificationToggle'),
    };

    elements.startBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'start' });
    });

    elements.stopBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'stop' });
    });

    elements.resetBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'reset' });
    });

    ['workDuration', 'breakDuration', 'longBreakDuration', 'sessionsBeforeLongBreak'].forEach(id => {
      elements[id].addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const valueElementId = id.replace('Duration', 'Value').replace('sessionsBeforeLongBreak', 'sessionsValue');
        elements[valueElementId].textContent = value;

        const settings = {};
        settings[\`pomodoroTimer.\${id}\`] = value;
        vscode.postMessage({ command: 'updateSettings', settings });
      });
    });

    elements.soundToggle.addEventListener('click', () => {
      const isActive = elements.soundToggle.classList.toggle('active');
      vscode.postMessage({
        command: 'updateSettings',
        settings: { 'pomodoroTimer.soundEnabled': isActive }
      });
    });

    elements.notificationToggle.addEventListener('click', () => {
      const isActive = elements.notificationToggle.classList.toggle('active');
      vscode.postMessage({
        command: 'updateSettings',
        settings: { 'pomodoroTimer.notificationEnabled': isActive }
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.command === 'update') {
        state = message.state;
        updateUI();
      }
    });

    function updateUI() {
      const minutes = Math.floor(state.timeLeft / 60);
      const seconds = state.timeLeft % 60;
      const timeStr = \`\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`;

      elements.time.textContent = timeStr;
      elements.sessionType.textContent = state.isWorkSession ? 'Work Session' : 'Break Time';
      elements.sessionsCount.textContent = state.sessionsCompleted;

      if (state.isRunning) {
        elements.statusIndicator.className = 'status-indicator running';
      } else {
        elements.statusIndicator.className = 'status-indicator stopped';
      }

      elements.workDuration.value = state.workDuration;
      elements.breakDuration.value = state.breakDuration;
      elements.longBreakDuration.value = state.longBreakDuration;
      elements.sessionsBeforeLongBreak.value = state.sessionsBeforeLongBreak;

      elements.workValue.textContent = state.workDuration;
      elements.breakValue.textContent = state.breakDuration;
      elements.longBreakValue.textContent = state.longBreakDuration;
      elements.sessionsValue.textContent = state.sessionsBeforeLongBreak;

      if (state.soundEnabled) {
        elements.soundToggle.classList.add('active');
      } else {
        elements.soundToggle.classList.remove('active');
      }

      if (state.notificationEnabled) {
        elements.notificationToggle.classList.add('active');
      } else {
        elements.notificationToggle.classList.remove('active');
      }
    }

    updateUI();
  </script>
</body>
</html>`;
  }
}

const pomodoroTimer = new PomodoroTimer();

function activate(context) {
  pomodoroTimer.activate(context);
}

function deactivate() {
  if (pomodoroTimer.timer) clearInterval(pomodoroTimer.timer);
}

module.exports = {
  activate,
  deactivate,
};