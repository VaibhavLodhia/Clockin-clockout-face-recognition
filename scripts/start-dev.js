// Start development environment - runs Python service and Expo together
// This script activates venv, starts Python service, then starts Expo

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

// Get project root (parent of scripts directory)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PYTHON_SERVICE_DIR = path.join(PROJECT_ROOT, 'python-service');
const VENV_PATH = path.join(PYTHON_SERVICE_DIR, 'venv');

// Log paths for debugging
console.log('📁 Project root:', PROJECT_ROOT);
console.log('📁 Python service dir:', PYTHON_SERVICE_DIR);
console.log('📁 Venv path:', VENV_PATH);

// Determine Python executable based on OS
const isWindows = process.platform === 'win32';
const PYTHON_EXE = isWindows
  ? path.join(VENV_PATH, 'Scripts', 'python.exe')
  : path.join(VENV_PATH, 'bin', 'python');

// Check if venv exists
if (!fs.existsSync(VENV_PATH)) {
  console.error('❌ Virtual environment not found at:', VENV_PATH);
  console.error('Please create venv first: cd python-service && python -m venv venv');
  process.exit(1);
}

if (!fs.existsSync(PYTHON_EXE)) {
  console.error('❌ Python executable not found at:', PYTHON_EXE);
  console.error('Please install dependencies: cd python-service && venv\\Scripts\\activate && pip install -r requirements.txt');
  process.exit(1);
}

console.log('🚀 Starting development environment...');
console.log('🐍 Starting Python face recognition service...');
console.log('🐍 Python executable:', PYTHON_EXE);
console.log('🐍 Working directory:', PYTHON_SERVICE_DIR);

// Verify main.py exists
const MAIN_PY = path.join(PYTHON_SERVICE_DIR, 'main.py');
if (!fs.existsSync(MAIN_PY)) {
  console.error('❌ main.py not found at:', MAIN_PY);
  process.exit(1);
}

// On Windows with paths containing spaces, use a command string with shell
// On other platforms, use spawn without shell
let pythonProcess;
if (isWindows) {
  // Quote the Python path to handle spaces, use shell: true
  const pythonCmd = `"${PYTHON_EXE}" main.py`;
  pythonProcess = spawn(pythonCmd, [], {
    cwd: PYTHON_SERVICE_DIR,
    stdio: 'inherit',
    shell: true, // Use shell to properly handle quoted paths
  });
} else {
  pythonProcess = spawn(PYTHON_EXE, ['main.py'], {
    cwd: PYTHON_SERVICE_DIR,
    stdio: 'inherit',
    shell: false,
  });
}

pythonProcess.on('error', (error) => {
  console.error('❌ Failed to start Python service:', error.message);
  process.exit(1);
});

// Wait for Python service to be ready
function waitForService(maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkService = () => {
      attempts++;
      const req = http.get('http://127.0.0.1:8000/', (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Python service is running on http://127.0.0.1:8000');
          resolve();
        } else {
          if (attempts < maxAttempts) {
            setTimeout(checkService, 1000);
          } else {
            console.log('⚠️  Python service may not be ready yet, but continuing...');
            resolve();
          }
        }
      });
      
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(checkService, 1000);
        } else {
          console.log('⚠️  Python service may not be ready yet, but continuing...');
          resolve();
        }
      });
      
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(checkService, 1000);
        } else {
          console.log('⚠️  Python service may not be ready yet, but continuing...');
          resolve();
        }
      });
    };
    
    // Wait 2 seconds before first check
    setTimeout(checkService, 2000);
  });
}

// Start Expo after Python service is ready
waitForService().then(() => {
  console.log('📱 Starting Expo...');
  console.log('');
  
  // Start Expo with tunnel mode for better connectivity
  // Tunnel mode works better across networks and firewalls
  const expoProcess = spawn('npx', ['expo', 'start', '--clear', '--tunnel'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  
  expoProcess.on('error', (error) => {
    console.error('❌ Failed to start Expo:', error.message);
    pythonProcess.kill();
    process.exit(1);
  });
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    pythonProcess.kill();
    expoProcess.kill();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    pythonProcess.kill();
    expoProcess.kill();
    process.exit(0);
  });
});

// Handle Python process exit
pythonProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error('❌ Python service exited with code:', code);
  }
});

