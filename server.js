/**
 * System Resource Monitor - Node.js 서버
 * Express + Socket.IO를 사용한 실시간 시스템 모니터링
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const si = require('systeminformation');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = 3000;

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 시스템 정보 수집 함수
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
            .slice(0, 10)
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

// Socket.IO 연결 처리
io.on('connection', (socket) => {
    console.log('클라이언트 연결됨:', socket.id);

    // 매 1초마다 시스템 정보 전송
    const interval = setInterval(async () => {
        const info = await getSystemInfo();
        socket.emit('system-info', info);
    }, 1000);

    // 초기 데이터 즉시 전송
    (async () => {
        const info = await getSystemInfo();
        socket.emit('system-info', info);
    })();

    socket.on('disconnect', () => {
        console.log('클라이언트 연결 해제:', socket.id);
        clearInterval(interval);
    });
});

// 서버 시작
httpServer.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       System Resource Monitor 서버가 시작되었습니다!           ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   브라우저에서 열기: http://localhost:${PORT}                    ║
║                                                               ║
║   종료하려면 Ctrl+C를 누르세요.                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

    // 브라우저 자동 열기
    try {
        const open = (await import('open')).default;
        await open(`http://localhost:${PORT}`);
    } catch (err) {
        console.log('브라우저를 수동으로 열어주세요: http://localhost:' + PORT);
    }
});
