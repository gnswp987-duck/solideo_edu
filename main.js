const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const si = require('systeminformation');

let mainWindow;
let monitoringInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0f1419',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 개발자 도구 (개발용)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
  });

  // 실시간 모니터링 시작
  startMonitoring();
}

async function getSystemInfo() {
  try {
    const [
      cpu,
      cpuCurrentSpeed,
      cpuTemperature,
      mem,
      graphics,
      diskLayout,
      fsSize,
      networkStats,
      networkInterfaces,
      currentLoad,
      processes,
      time,
      osInfo,
      system
    ] = await Promise.all([
      si.cpu(),
      si.cpuCurrentSpeed(),
      si.cpuTemperature(),
      si.mem(),
      si.graphics(),
      si.diskLayout(),
      si.fsSize(),
      si.networkStats(),
      si.networkInterfaces(),
      si.currentLoad(),
      si.processes(),
      si.time(),
      si.osInfo(),
      si.system()
    ]);

    // GPU 정보 처리
    const gpuInfo = graphics.controllers && graphics.controllers.length > 0
      ? graphics.controllers[0]
      : null;

    // 네트워크 인터페이스 중 활성화된 것 선택
    const activeNetwork = networkStats && networkStats.length > 0
      ? networkStats.find(n => n.rx_sec > 0 || n.tx_sec > 0) || networkStats[0]
      : null;

    // 상위 프로세스 (CPU 사용률 기준)
    const topProcesses = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 8)
      .map(p => ({
        name: p.name,
        pid: p.pid,
        cpu: p.cpu,
        mem: p.mem,
        memRss: p.memRss
      }));

    return {
      timestamp: Date.now(),
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpuCurrentSpeed.avg || cpu.speed,
        speedMin: cpuCurrentSpeed.min,
        speedMax: cpuCurrentSpeed.max,
        temperature: cpuTemperature.main || null,
        temperatureMax: cpuTemperature.max || null,
        usage: currentLoad.currentLoad,
        coreLoads: currentLoad.cpus ? currentLoad.cpus.map(c => c.load) : []
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        active: mem.active,
        available: mem.available,
        usagePercent: (mem.used / mem.total) * 100,
        swapTotal: mem.swaptotal,
        swapUsed: mem.swapused
      },
      gpu: gpuInfo ? {
        vendor: gpuInfo.vendor,
        model: gpuInfo.model,
        vram: gpuInfo.vram,
        vramDynamic: gpuInfo.vramDynamic,
        temperature: gpuInfo.temperatureGpu || null,
        utilizationGpu: gpuInfo.utilizationGpu || null,
        memoryUsed: gpuInfo.memoryUsed || null,
        memoryTotal: gpuInfo.memoryTotal || null
      } : null,
      disk: {
        layout: diskLayout.map(d => ({
          device: d.device,
          type: d.type,
          name: d.name,
          size: d.size
        })),
        partitions: fsSize.map(fs => ({
          fs: fs.fs,
          mount: fs.mount,
          size: fs.size,
          used: fs.used,
          available: fs.available,
          usagePercent: fs.use
        }))
      },
      network: activeNetwork ? {
        interface: activeNetwork.iface,
        rxBytes: activeNetwork.rx_bytes,
        txBytes: activeNetwork.tx_bytes,
        rxSec: activeNetwork.rx_sec,
        txSec: activeNetwork.tx_sec,
        rxDropped: activeNetwork.rx_dropped,
        txDropped: activeNetwork.tx_dropped
      } : null,
      processes: topProcesses,
      system: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname,
        uptime: time.uptime,
        manufacturer: system.manufacturer,
        model: system.model
      }
    };
  } catch (error) {
    console.error('시스템 정보 수집 오류:', error);
    return { error: error.message };
  }
}

function startMonitoring() {
  // 매 1초마다 시스템 정보 수집 및 전송
  monitoringInterval = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const info = await getSystemInfo();
      mainWindow.webContents.send('system-info', info);
    }
  }, 1000);

  // 초기 데이터 즉시 전송
  setTimeout(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const info = await getSystemInfo();
      mainWindow.webContents.send('system-info', info);
    }
  }, 500);
}

// IPC 핸들러 설정
function setupIPC() {
  ipcMain.handle('get-system-info', async () => {
    return await getSystemInfo();
  });

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
}

// 앱 시작
app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
