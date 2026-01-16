/**
 * System Resource Monitor - 클라이언트 앱 스크립트
 * Socket.IO를 통한 실시간 시스템 정보 표시 및 PDF 보고서 생성
 */

// ==========================================
// 전역 변수
// ==========================================
let socket;
let charts = {};
let historyData = {
    cpu: [],
    memory: [],
    gpuUsage: [],
    gpuTemp: [],
    networkDown: [],
    networkUp: [],
    timestamps: []
};
const MAX_HISTORY_POINTS = 60; // 60초 히스토리

// PDF 보고서용 데이터 수집
let pdfDataCollection = {
    isCollecting: false,
    startTime: null,
    data: [],
    duration: 5 * 60 * 1000 // 5분
};

// ==========================================
// 유틸리티 함수
// ==========================================
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatBytesPerSec(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}일 ${hours}시간`;
    }
    return `${hours}시간 ${mins}분`;
}

function formatTime(date) {
    return date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatDateTime(date) {
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 값 변화 애니메이션
function animateValue(element, newValue) {
    if (!element) return;
    const currentValue = element.textContent;
    if (currentValue !== newValue) {
        element.textContent = newValue;
        element.classList.add('value-change');
        setTimeout(() => element.classList.remove('value-change'), 300);
    }
}

// ==========================================
// 차트 초기화
// ==========================================
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 300
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                backgroundColor: '#1a2332',
                titleColor: '#e7e9ea',
                bodyColor: '#8b98a5',
                borderColor: '#2d3e50',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8
            }
        },
        scales: {
            x: {
                display: false
            },
            y: {
                display: true,
                min: 0,
                max: 100,
                grid: {
                    color: 'rgba(45, 62, 80, 0.5)',
                    drawBorder: false
                },
                ticks: {
                    color: '#5c6b7d',
                    font: { size: 10 },
                    callback: (value) => value + '%'
                }
            }
        }
    };

    // CPU 차트
    const cpuCtx = document.getElementById('cpu-chart');
    if (cpuCtx) {
        charts.cpu = new Chart(cpuCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [{
                    data: Array(30).fill(0),
                    borderColor: '#2d7ff9',
                    backgroundColor: 'rgba(45, 127, 249, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: chartOptions
        });
    }

    // 메모리 차트
    const memCtx = document.getElementById('memory-chart');
    if (memCtx) {
        charts.memory = new Chart(memCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [{
                    data: Array(30).fill(0),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: chartOptions
        });
    }

    // GPU 차트
    const gpuCtx = document.getElementById('gpu-chart');
    if (gpuCtx) {
        charts.gpu = new Chart(gpuCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [{
                    data: Array(30).fill(0),
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: chartOptions
        });
    }

    // 네트워크 차트
    const netCtx = document.getElementById('network-chart');
    if (netCtx) {
        charts.network = new Chart(netCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [
                    {
                        label: '다운로드',
                        data: Array(30).fill(0),
                        borderColor: '#06b6d4',
                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    },
                    {
                        label: '업로드',
                        data: Array(30).fill(0),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        display: true,
                        min: 0,
                        grid: {
                            color: 'rgba(45, 62, 80, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#5c6b7d',
                            font: { size: 10 },
                            callback: (value) => formatBytesPerSec(value)
                        }
                    }
                }
            }
        });
    }

    // 히스토리 차트들 초기화
    initHistoryCharts();
}

function initHistoryCharts() {
    const historyOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                backgroundColor: '#1a2332',
                titleColor: '#e7e9ea',
                bodyColor: '#8b98a5',
                borderColor: '#2d3e50',
                borderWidth: 1
            }
        },
        scales: {
            x: {
                display: true,
                grid: { color: 'rgba(45, 62, 80, 0.3)' },
                ticks: { color: '#5c6b7d', font: { size: 10 }, maxTicksLimit: 10 }
            },
            y: {
                display: true,
                min: 0,
                max: 100,
                grid: { color: 'rgba(45, 62, 80, 0.5)' },
                ticks: { color: '#5c6b7d', font: { size: 10 }, callback: (v) => v + '%' }
            }
        }
    };

    // CPU 히스토리
    const cpuHistoryCtx = document.getElementById('cpu-history-chart');
    if (cpuHistoryCtx) {
        charts.cpuHistory = new Chart(cpuHistoryCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#2d7ff9',
                    backgroundColor: 'rgba(45, 127, 249, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: historyOptions
        });
    }

    // 메모리 히스토리
    const memHistoryCtx = document.getElementById('memory-history-chart');
    if (memHistoryCtx) {
        charts.memoryHistory = new Chart(memHistoryCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: historyOptions
        });
    }

    // 메모리 분포 차트
    const memDistCtx = document.getElementById('memory-distribution-chart');
    if (memDistCtx) {
        charts.memoryDistribution = new Chart(memDistCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['사용 중', '사용 가능'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#8b5cf6', '#1e2a3d'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#8b98a5', font: { size: 11 } }
                    }
                }
            }
        });
    }

    // GPU 히스토리
    const gpuHistoryCtx = document.getElementById('gpu-history-chart');
    if (gpuHistoryCtx) {
        charts.gpuHistory = new Chart(gpuHistoryCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: historyOptions
        });
    }

    // GPU 온도 차트
    const gpuTempCtx = document.getElementById('gpu-temp-chart');
    if (gpuTempCtx) {
        charts.gpuTemp = new Chart(gpuTempCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: {
                ...historyOptions,
                scales: {
                    ...historyOptions.scales,
                    y: {
                        ...historyOptions.scales.y,
                        max: 100,
                        ticks: { color: '#5c6b7d', font: { size: 10 }, callback: (v) => v + '°C' }
                    }
                }
            }
        });
    }

    // 네트워크 히스토리
    const netHistoryCtx = document.getElementById('network-history-chart');
    if (netHistoryCtx) {
        charts.networkHistory = new Chart(netHistoryCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '다운로드',
                        data: [],
                        borderColor: '#06b6d4',
                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0
                    },
                    {
                        label: '업로드',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                ...historyOptions,
                plugins: {
                    ...historyOptions.plugins,
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#8b98a5', font: { size: 11 } }
                    }
                },
                scales: {
                    ...historyOptions.scales,
                    y: {
                        display: true,
                        min: 0,
                        grid: { color: 'rgba(45, 62, 80, 0.5)' },
                        ticks: {
                            color: '#5c6b7d',
                            font: { size: 10 },
                            callback: (v) => formatBytesPerSec(v)
                        }
                    }
                }
            }
        });
    }
}

// ==========================================
// 데이터 업데이트 함수
// ==========================================
function updateDashboard(data) {
    if (data.error) {
        console.error('데이터 수집 오류:', data.error);
        return;
    }

    // 현재 시간 업데이트
    const currentTime = document.getElementById('current-time');
    if (currentTime) {
        currentTime.textContent = formatDateTime(new Date(data.timestamp));
    }

    // CPU 업데이트
    updateCPU(data.cpu);

    // 메모리 업데이트
    updateMemory(data.memory);

    // GPU 업데이트
    updateGPU(data.gpu);

    // 네트워크 업데이트
    updateNetwork(data.network);

    // 디스크 업데이트
    updateDisk(data.disk);

    // 프로세스 업데이트
    updateProcesses(data.processes);

    // 시스템 정보 업데이트
    updateSystemInfo(data.system);

    // 히스토리 데이터 추가
    addToHistory(data);

    // PDF 데이터 수집
    if (pdfDataCollection.isCollecting) {
        pdfDataCollection.data.push({
            timestamp: data.timestamp,
            cpu: data.cpu,
            memory: data.memory,
            gpu: data.gpu,
            network: data.network
        });
    }
}

function updateCPU(cpu) {
    if (!cpu) return;

    // 뱃지 업데이트
    const cpuBadge = document.getElementById('cpu-badge');
    if (cpuBadge) {
        animateValue(cpuBadge, cpu.usage.toFixed(1) + '%');
    }

    // 모델 정보
    const cpuModel = document.getElementById('cpu-model');
    if (cpuModel && cpu.brand) {
        cpuModel.textContent = cpu.brand;
    }

    // 코어 및 속도
    const cpuCores = document.getElementById('cpu-cores');
    if (cpuCores) {
        cpuCores.textContent = `${cpu.cores} 코어 (${cpu.physicalCores} 물리)`;
    }

    const cpuSpeed = document.getElementById('cpu-speed');
    if (cpuSpeed) {
        cpuSpeed.textContent = `${cpu.speed.toFixed(2)} GHz`;
    }

    // 온도
    const cpuTemp = document.getElementById('cpu-temp');
    if (cpuTemp) {
        cpuTemp.textContent = cpu.temperature ? `${cpu.temperature}°C` : 'N/A';
    }

    // 최대 속도
    const cpuMaxSpeed = document.getElementById('cpu-max-speed');
    if (cpuMaxSpeed) {
        cpuMaxSpeed.textContent = cpu.speedMax ? `${cpu.speedMax.toFixed(2)} GHz` : 'N/A';
    }

    // 차트 업데이트
    if (charts.cpu) {
        charts.cpu.data.datasets[0].data.push(cpu.usage);
        charts.cpu.data.datasets[0].data.shift();
        charts.cpu.update('none');
    }

    // 코어별 사용률 그리드 업데이트
    updateCoresGrid(cpu.coreLoads);

    // CPU 상세 정보 업데이트
    updateCPUDetailInfo(cpu);
}

function updateCoresGrid(coreLoads) {
    const grid = document.getElementById('cpu-cores-grid');
    if (!grid || !coreLoads) return;

    if (grid.children.length !== coreLoads.length) {
        grid.innerHTML = coreLoads.map((load, i) => `
      <div class="core-item">
        <div class="core-label">Core ${i}</div>
        <div class="core-value">${load.toFixed(0)}%</div>
        <div class="core-bar">
          <div class="core-bar-fill" style="width: ${load}%"></div>
        </div>
      </div>
    `).join('');
    } else {
        coreLoads.forEach((load, i) => {
            const item = grid.children[i];
            const valueEl = item.querySelector('.core-value');
            const barEl = item.querySelector('.core-bar-fill');
            if (valueEl) valueEl.textContent = load.toFixed(0) + '%';
            if (barEl) barEl.style.width = load + '%';
        });
    }
}

function updateCPUDetailInfo(cpu) {
    const infoList = document.getElementById('cpu-detail-info');
    if (!infoList) return;

    const info = [
        { label: '제조사', value: cpu.manufacturer || 'N/A' },
        { label: '모델', value: cpu.brand || 'N/A' },
        { label: '코어 수', value: `${cpu.cores} (물리: ${cpu.physicalCores})` },
        { label: '현재 속도', value: `${cpu.speed.toFixed(2)} GHz` },
        { label: '최대 속도', value: cpu.speedMax ? `${cpu.speedMax.toFixed(2)} GHz` : 'N/A' },
        { label: '온도', value: cpu.temperature ? `${cpu.temperature}°C` : 'N/A' }
    ];

    infoList.innerHTML = info.map(item => `
    <div class="info-item">
      <span class="info-label">${item.label}</span>
      <span class="info-value">${item.value}</span>
    </div>
  `).join('');
}

function updateMemory(mem) {
    if (!mem) return;

    // 뱃지 업데이트
    const memBadge = document.getElementById('memory-badge');
    if (memBadge) {
        animateValue(memBadge, mem.usagePercent.toFixed(1) + '%');
    }

    // 메모리 바
    const memBar = document.getElementById('memory-bar');
    if (memBar) {
        memBar.style.width = mem.usagePercent + '%';
    }

    // 사용량 레이블
    const memUsed = document.getElementById('memory-used');
    if (memUsed) {
        memUsed.textContent = formatBytes(mem.used);
    }

    const memTotal = document.getElementById('memory-total');
    if (memTotal) {
        memTotal.textContent = '/ ' + formatBytes(mem.total);
    }

    // 추가 메트릭
    const memAvailable = document.getElementById('memory-available');
    if (memAvailable) {
        memAvailable.textContent = formatBytes(mem.available);
    }

    const memCached = document.getElementById('memory-cached');
    if (memCached) {
        memCached.textContent = formatBytes(mem.active);
    }

    // 차트 업데이트
    if (charts.memory) {
        charts.memory.data.datasets[0].data.push(mem.usagePercent);
        charts.memory.data.datasets[0].data.shift();
        charts.memory.update('none');
    }

    // 메모리 분포 차트
    if (charts.memoryDistribution) {
        charts.memoryDistribution.data.datasets[0].data = [
            mem.usagePercent,
            100 - mem.usagePercent
        ];
        charts.memoryDistribution.update('none');
    }

    // 메모리 상세 정보 업데이트
    updateMemoryDetailInfo(mem);
}

function updateMemoryDetailInfo(mem) {
    const infoList = document.getElementById('memory-detail-info');
    if (!infoList) return;

    const info = [
        { label: '전체 메모리', value: formatBytes(mem.total) },
        { label: '사용 중', value: formatBytes(mem.used) },
        { label: '사용 가능', value: formatBytes(mem.available) },
        { label: '활성 메모리', value: formatBytes(mem.active) },
        { label: '사용률', value: mem.usagePercent.toFixed(1) + '%' },
        { label: 'Swap 전체', value: formatBytes(mem.swapTotal) },
        { label: 'Swap 사용', value: formatBytes(mem.swapUsed) }
    ];

    infoList.innerHTML = info.map(item => `
    <div class="info-item">
      <span class="info-label">${item.label}</span>
      <span class="info-value">${item.value}</span>
    </div>
  `).join('');
}

function updateGPU(gpu) {
    // 뱃지 업데이트
    const gpuBadge = document.getElementById('gpu-badge');
    if (gpuBadge) {
        if (gpu && gpu.utilizationGpu !== null) {
            animateValue(gpuBadge, gpu.utilizationGpu.toFixed(0) + '%');
        } else {
            gpuBadge.textContent = 'N/A';
        }
    }

    // 모델 정보
    const gpuModel = document.getElementById('gpu-model');
    if (gpuModel) {
        gpuModel.textContent = gpu ? `${gpu.vendor || ''} ${gpu.model || 'Unknown GPU'}`.trim() : 'GPU 없음';
    }

    // VRAM
    const gpuVram = document.getElementById('gpu-vram');
    if (gpuVram) {
        gpuVram.textContent = gpu && gpu.vram ? `VRAM: ${gpu.vram} MB` : 'VRAM: N/A';
    }

    // 온도
    const gpuTemp = document.getElementById('gpu-temp');
    if (gpuTemp) {
        gpuTemp.textContent = gpu && gpu.temperature ? `${gpu.temperature}°C` : 'N/A';
    }

    // VRAM 사용량
    const gpuMemUsed = document.getElementById('gpu-memory-used');
    if (gpuMemUsed) {
        if (gpu && gpu.memoryUsed) {
            gpuMemUsed.textContent = `${gpu.memoryUsed} MB`;
        } else {
            gpuMemUsed.textContent = 'N/A';
        }
    }

    // 차트 업데이트
    const usage = gpu && gpu.utilizationGpu !== null ? gpu.utilizationGpu : 0;
    if (charts.gpu) {
        charts.gpu.data.datasets[0].data.push(usage);
        charts.gpu.data.datasets[0].data.shift();
        charts.gpu.update('none');
    }

    // GPU 상세 정보 업데이트
    updateGPUDetailInfo(gpu);
}

function updateGPUDetailInfo(gpu) {
    const infoList = document.getElementById('gpu-detail-info');
    if (!infoList) return;

    if (!gpu) {
        infoList.innerHTML = '<div class="info-item"><span class="info-value">GPU 정보를 가져올 수 없습니다.</span></div>';
        return;
    }

    const info = [
        { label: '제조사', value: gpu.vendor || 'N/A' },
        { label: '모델', value: gpu.model || 'N/A' },
        { label: 'VRAM', value: gpu.vram ? `${gpu.vram} MB` : 'N/A' },
        { label: 'VRAM 사용', value: gpu.memoryUsed ? `${gpu.memoryUsed} MB` : 'N/A' },
        { label: '사용률', value: gpu.utilizationGpu !== null ? `${gpu.utilizationGpu}%` : 'N/A' },
        { label: '온도', value: gpu.temperature ? `${gpu.temperature}°C` : 'N/A' }
    ];

    infoList.innerHTML = info.map(item => `
    <div class="info-item">
      <span class="info-label">${item.label}</span>
      <span class="info-value">${item.value}</span>
    </div>
  `).join('');
}

function updateNetwork(net) {
    // 인터페이스 이름
    const netInterface = document.getElementById('network-interface');
    if (netInterface) {
        netInterface.textContent = net ? (net.interface || 'eth0') : 'N/A';
    }

    // 다운로드 속도
    const netDown = document.getElementById('network-download');
    if (netDown) {
        animateValue(netDown, net ? formatBytesPerSec(net.rxSec) : '0 B/s');
    }

    // 업로드 속도
    const netUp = document.getElementById('network-upload');
    if (netUp) {
        animateValue(netUp, net ? formatBytesPerSec(net.txSec) : '0 B/s');
    }

    // 총 수신/송신
    const netTotalRx = document.getElementById('network-total-rx');
    if (netTotalRx) {
        netTotalRx.textContent = net ? formatBytes(net.rxBytes) : 'N/A';
    }

    const netTotalTx = document.getElementById('network-total-tx');
    if (netTotalTx) {
        netTotalTx.textContent = net ? formatBytes(net.txBytes) : 'N/A';
    }

    // 차트 업데이트
    if (charts.network && net) {
        charts.network.data.datasets[0].data.push(net.rxSec || 0);
        charts.network.data.datasets[0].data.shift();
        charts.network.data.datasets[1].data.push(net.txSec || 0);
        charts.network.data.datasets[1].data.shift();
        charts.network.update('none');
    }

    // 네트워크 상세 정보
    updateNetworkDetailInfo(net);
}

function updateNetworkDetailInfo(net) {
    const infoList = document.getElementById('network-detail-info');
    if (!infoList) return;

    if (!net) {
        infoList.innerHTML = '<div class="info-item"><span class="info-value">네트워크 정보 없음</span></div>';
        return;
    }

    const info = [
        { label: '인터페이스', value: net.interface || 'N/A' },
        { label: '다운로드 속도', value: formatBytesPerSec(net.rxSec) },
        { label: '업로드 속도', value: formatBytesPerSec(net.txSec) },
        { label: '총 수신', value: formatBytes(net.rxBytes) },
        { label: '총 송신', value: formatBytes(net.txBytes) },
        { label: '드롭 (수신)', value: net.rxDropped || 0 },
        { label: '드롭 (송신)', value: net.txDropped || 0 }
    ];

    infoList.innerHTML = info.map(item => `
    <div class="info-item">
      <span class="info-label">${item.label}</span>
      <span class="info-value">${item.value}</span>
    </div>
  `).join('');
}

function updateDisk(disk) {
    if (!disk) return;

    // 대시보드 디스크 리스트
    const diskList = document.getElementById('disk-list');
    if (diskList && disk.partitions) {
        diskList.innerHTML = disk.partitions.map(part => {
            let statusClass = '';
            if (part.usagePercent >= 90) statusClass = 'danger';
            else if (part.usagePercent >= 75) statusClass = 'warning';

            return `
        <div class="disk-item ${statusClass}">
          <div class="disk-name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            ${part.mount || part.fs}
          </div>
          <div class="disk-bar-container">
            <div class="disk-bar" style="width: ${part.usagePercent}%"></div>
          </div>
          <div class="disk-info">
            <span class="disk-usage">${formatBytes(part.used)} / ${formatBytes(part.size)}</span>
            <span class="disk-percent">${part.usagePercent.toFixed(1)}%</span>
          </div>
        </div>
      `;
        }).join('');
    }

    // 디스크 상세 리스트
    const diskDetailList = document.getElementById('disk-detail-list');
    if (diskDetailList && disk.partitions) {
        diskDetailList.innerHTML = disk.partitions.map(part => `
      <div class="disk-detail-item">
        <div class="disk-header">
          <span class="disk-name">${part.mount || part.fs}</span>
          <span class="disk-percent">${part.usagePercent.toFixed(1)}%</span>
        </div>
        <div class="disk-bar-container">
          <div class="disk-bar" style="width: ${part.usagePercent}%"></div>
        </div>
        <div class="disk-stats">
          <span><span class="disk-stat-label">전체: </span><span class="disk-stat-value">${formatBytes(part.size)}</span></span>
          <span><span class="disk-stat-label">사용: </span><span class="disk-stat-value">${formatBytes(part.used)}</span></span>
          <span><span class="disk-stat-label">사용 가능: </span><span class="disk-stat-value">${formatBytes(part.available)}</span></span>
        </div>
      </div>
    `).join('');
    }

    // 물리 디스크 정보
    const diskLayoutInfo = document.getElementById('disk-layout-info');
    if (diskLayoutInfo && disk.layout) {
        diskLayoutInfo.innerHTML = disk.layout.map((d, i) => `
      <div class="info-item">
        <span class="info-label">디스크 ${i + 1}: ${d.name || 'Unknown'}</span>
        <span class="info-value">${d.type || 'HDD'} - ${formatBytes(d.size)}</span>
      </div>
    `).join('');
    }
}

function updateProcesses(processes) {
    if (!processes) return;

    const processList = document.getElementById('process-list');
    const processDetailList = document.getElementById('process-detail-list');

    const renderRow = (proc) => {
        let cpuClass = '';
        if (proc.cpu > 50) cpuClass = 'cpu-high';
        else if (proc.cpu > 20) cpuClass = 'cpu-medium';

        return `
      <tr>
        <td class="process-name">${proc.name}</td>
        <td>${proc.pid}</td>
        <td class="${cpuClass}">${proc.cpu.toFixed(1)}%</td>
        <td>${proc.mem.toFixed(1)}%</td>
        <td>${formatBytes(proc.memRss * 1024)}</td>
      </tr>
    `;
    };

    if (processList) {
        processList.innerHTML = processes.slice(0, 8).map(p => renderRow(p)).join('');
    }

    if (processDetailList) {
        processDetailList.innerHTML = processes.slice(0, 10).map(p => renderRow(p)).join('');
    }
}

function updateSystemInfo(sys) {
    if (!sys) return;

    const osInfo = document.getElementById('os-info');
    if (osInfo) {
        osInfo.textContent = sys.platform || 'Unknown';
    }

    const hostname = document.getElementById('hostname');
    if (hostname) {
        hostname.textContent = sys.hostname || 'Unknown';
    }

    const uptime = document.getElementById('uptime');
    if (uptime) {
        uptime.textContent = formatUptime(sys.uptime);
    }
}

function addToHistory(data) {
    const time = formatTime(new Date(data.timestamp));

    historyData.timestamps.push(time);
    historyData.cpu.push(data.cpu ? data.cpu.usage : 0);
    historyData.memory.push(data.memory ? data.memory.usagePercent : 0);
    historyData.gpuUsage.push(data.gpu && data.gpu.utilizationGpu !== null ? data.gpu.utilizationGpu : 0);
    historyData.gpuTemp.push(data.gpu && data.gpu.temperature ? data.gpu.temperature : 0);
    historyData.networkDown.push(data.network ? data.network.rxSec : 0);
    historyData.networkUp.push(data.network ? data.network.txSec : 0);

    // 최대 포인트 수 유지
    if (historyData.timestamps.length > MAX_HISTORY_POINTS) {
        historyData.timestamps.shift();
        historyData.cpu.shift();
        historyData.memory.shift();
        historyData.gpuUsage.shift();
        historyData.gpuTemp.shift();
        historyData.networkDown.shift();
        historyData.networkUp.shift();
    }

    // 히스토리 차트 업데이트
    updateHistoryCharts();
}

function updateHistoryCharts() {
    if (charts.cpuHistory) {
        charts.cpuHistory.data.labels = historyData.timestamps;
        charts.cpuHistory.data.datasets[0].data = historyData.cpu;
        charts.cpuHistory.update('none');
    }

    if (charts.memoryHistory) {
        charts.memoryHistory.data.labels = historyData.timestamps;
        charts.memoryHistory.data.datasets[0].data = historyData.memory;
        charts.memoryHistory.update('none');
    }

    if (charts.gpuHistory) {
        charts.gpuHistory.data.labels = historyData.timestamps;
        charts.gpuHistory.data.datasets[0].data = historyData.gpuUsage;
        charts.gpuHistory.update('none');
    }

    if (charts.gpuTemp) {
        charts.gpuTemp.data.labels = historyData.timestamps;
        charts.gpuTemp.data.datasets[0].data = historyData.gpuTemp;
        charts.gpuTemp.update('none');
    }

    if (charts.networkHistory) {
        charts.networkHistory.data.labels = historyData.timestamps;
        charts.networkHistory.data.datasets[0].data = historyData.networkDown;
        charts.networkHistory.data.datasets[1].data = historyData.networkUp;
        charts.networkHistory.update('none');
    }
}

// ==========================================
// PDF 보고서 생성
// ==========================================
async function generatePDFReport() {
    const modal = document.getElementById('pdf-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressTime = document.getElementById('progress-time');
    const progressStatus = document.getElementById('progress-status');

    // 모달 표시
    modal.classList.add('active');

    // 데이터 수집 시작
    pdfDataCollection.isCollecting = true;
    pdfDataCollection.startTime = Date.now();
    pdfDataCollection.data = [];

    const totalDuration = pdfDataCollection.duration;
    const circumference = 2 * Math.PI * 45; // 원 둘레
    progressBar.style.strokeDasharray = circumference;

    // 진행률 업데이트
    const updateProgress = setInterval(() => {
        const elapsed = Date.now() - pdfDataCollection.startTime;
        const remaining = Math.max(0, totalDuration - elapsed);
        const progress = elapsed / totalDuration;

        // 남은 시간 표시
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        progressTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        // 원형 프로그레스 바
        progressBar.style.strokeDashoffset = circumference * (1 - progress);

        // 상태 메시지
        const dataCount = pdfDataCollection.data.length;
        progressStatus.textContent = `데이터 수집 중... (${dataCount}개 샘플)`;

        if (remaining <= 0) {
            clearInterval(updateProgress);
            finalizePDFReport();
        }
    }, 1000);
}

async function finalizePDFReport() {
    const progressStatus = document.getElementById('progress-status');
    progressStatus.textContent = 'PDF 생성 중...';

    pdfDataCollection.isCollecting = false;

    // jsPDF 로드 확인
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // 데이터 분석
    const data = pdfDataCollection.data;
    if (data.length === 0) {
        alert('수집된 데이터가 없습니다.');
        document.getElementById('pdf-modal').classList.remove('active');
        return;
    }

    // 통계 계산
    const stats = calculateStats(data);

    // PDF 생성
    let yPos = 20;

    // 제목
    doc.setFontSize(20);
    doc.setTextColor(45, 127, 249);
    doc.text('System Resource Monitor Report', 105, yPos, { align: 'center' });

    yPos += 15;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${formatDateTime(new Date())}`, 105, yPos, { align: 'center' });
    doc.text(`Duration: 5 minutes`, 105, yPos + 5, { align: 'center' });

    yPos += 20;

    // CPU 섹션
    doc.setFontSize(14);
    doc.setTextColor(45, 127, 249);
    doc.text('CPU Usage', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Model: ${stats.cpu.model}`, 20, yPos);
    yPos += 6;
    doc.text(`Average: ${stats.cpu.avgUsage.toFixed(1)}%`, 20, yPos);
    doc.text(`Max: ${stats.cpu.maxUsage.toFixed(1)}%`, 80, yPos);
    doc.text(`Min: ${stats.cpu.minUsage.toFixed(1)}%`, 130, yPos);

    yPos += 15;

    // 메모리 섹션
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text('Memory Usage', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Total: ${formatBytes(stats.memory.total)}`, 20, yPos);
    yPos += 6;
    doc.text(`Average: ${stats.memory.avgUsage.toFixed(1)}%`, 20, yPos);
    doc.text(`Max: ${stats.memory.maxUsage.toFixed(1)}%`, 80, yPos);
    doc.text(`Min: ${stats.memory.minUsage.toFixed(1)}%`, 130, yPos);

    yPos += 15;

    // GPU 섹션
    doc.setFontSize(14);
    doc.setTextColor(34, 197, 94);
    doc.text('GPU', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Model: ${stats.gpu.model}`, 20, yPos);
    yPos += 6;
    if (stats.gpu.hasData) {
        doc.text(`Average Usage: ${stats.gpu.avgUsage.toFixed(1)}%`, 20, yPos);
        doc.text(`Avg Temp: ${stats.gpu.avgTemp.toFixed(1)}C`, 100, yPos);
    } else {
        doc.text('GPU data not available', 20, yPos);
    }

    yPos += 15;

    // 네트워크 섹션
    doc.setFontSize(14);
    doc.setTextColor(6, 182, 212);
    doc.text('Network Traffic', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Avg Download: ${formatBytesPerSec(stats.network.avgDown)}`, 20, yPos);
    doc.text(`Avg Upload: ${formatBytesPerSec(stats.network.avgUp)}`, 100, yPos);
    yPos += 6;
    doc.text(`Max Download: ${formatBytesPerSec(stats.network.maxDown)}`, 20, yPos);
    doc.text(`Max Upload: ${formatBytesPerSec(stats.network.maxUp)}`, 100, yPos);

    yPos += 20;

    // 시간별 데이터 표
    doc.setFontSize(14);
    doc.setTextColor(45, 127, 249);
    doc.text('Resource Usage Timeline (Samples)', 20, yPos);
    yPos += 10;

    // 표 헤더
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Time', 20, yPos);
    doc.text('CPU %', 50, yPos);
    doc.text('Memory %', 80, yPos);
    doc.text('GPU %', 110, yPos);
    doc.text('Download', 135, yPos);
    doc.text('Upload', 165, yPos);

    yPos += 2;
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 5;

    // 데이터 행 (최대 20개 샘플)
    const sampleData = data.filter((_, i) => i % Math.ceil(data.length / 20) === 0).slice(0, 20);
    doc.setTextColor(50);

    for (const sample of sampleData) {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }

        const time = formatTime(new Date(sample.timestamp));
        doc.text(time, 20, yPos);
        doc.text(sample.cpu ? sample.cpu.usage.toFixed(1) : '-', 50, yPos);
        doc.text(sample.memory ? sample.memory.usagePercent.toFixed(1) : '-', 80, yPos);
        doc.text(sample.gpu && sample.gpu.utilizationGpu !== null ? sample.gpu.utilizationGpu.toFixed(0) : '-', 110, yPos);
        doc.text(sample.network ? formatBytesPerSec(sample.network.rxSec) : '-', 135, yPos);
        doc.text(sample.network ? formatBytesPerSec(sample.network.txSec) : '-', 165, yPos);

        yPos += 6;
    }

    // 푸터
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`System Resource Monitor - Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
    }

    // 파일 저장
    const filename = `system_report_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.pdf`;
    doc.save(filename);

    // 모달 닫기
    document.getElementById('pdf-modal').classList.remove('active');
    alert(`PDF 보고서가 저장되었습니다: ${filename}`);
}

function calculateStats(data) {
    const cpuUsages = data.map(d => d.cpu ? d.cpu.usage : 0);
    const memUsages = data.map(d => d.memory ? d.memory.usagePercent : 0);
    const gpuUsages = data.filter(d => d.gpu && d.gpu.utilizationGpu !== null).map(d => d.gpu.utilizationGpu);
    const gpuTemps = data.filter(d => d.gpu && d.gpu.temperature).map(d => d.gpu.temperature);
    const netDown = data.map(d => d.network ? d.network.rxSec : 0);
    const netUp = data.map(d => d.network ? d.network.txSec : 0);

    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = arr => arr.length > 0 ? Math.max(...arr) : 0;
    const min = arr => arr.length > 0 ? Math.min(...arr) : 0;

    return {
        cpu: {
            model: data[0]?.cpu?.brand || 'Unknown',
            avgUsage: avg(cpuUsages),
            maxUsage: max(cpuUsages),
            minUsage: min(cpuUsages)
        },
        memory: {
            total: data[0]?.memory?.total || 0,
            avgUsage: avg(memUsages),
            maxUsage: max(memUsages),
            minUsage: min(memUsages)
        },
        gpu: {
            model: data[0]?.gpu ? `${data[0].gpu.vendor || ''} ${data[0].gpu.model || 'Unknown'}`.trim() : 'N/A',
            hasData: gpuUsages.length > 0,
            avgUsage: avg(gpuUsages),
            avgTemp: avg(gpuTemps)
        },
        network: {
            avgDown: avg(netDown),
            avgUp: avg(netUp),
            maxDown: max(netDown),
            maxUp: max(netUp)
        }
    };
}

// ==========================================
// 네비게이션
// ==========================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.dataset.section;

            // 활성 네비게이션 업데이트
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 섹션 전환
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `section-${targetSection}`) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// ==========================================
// PDF 버튼 및 모달
// ==========================================
function setupPDFExport() {
    const pdfBtn = document.getElementById('btn-pdf-export');
    const modal = document.getElementById('pdf-modal');
    const modalClose = document.getElementById('modal-close');

    pdfBtn?.addEventListener('click', () => {
        generatePDFReport();
    });

    modalClose?.addEventListener('click', () => {
        pdfDataCollection.isCollecting = false;
        modal.classList.remove('active');
    });
}

// ==========================================
// Socket.IO 연결
// ==========================================
function setupSocket() {
    socket = io();

    const connectionStatus = document.getElementById('connection-status');

    socket.on('connect', () => {
        console.log('서버에 연결됨');
        connectionStatus.classList.remove('disconnected');
        connectionStatus.querySelector('.status-text').textContent = '연결됨';
    });

    socket.on('disconnect', () => {
        console.log('서버 연결 끊김');
        connectionStatus.classList.add('disconnected');
        connectionStatus.querySelector('.status-text').textContent = '연결 끊김';
    });

    socket.on('system-info', (data) => {
        updateDashboard(data);
    });
}

// ==========================================
// 초기화
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 차트 초기화
    initCharts();

    // 네비게이션 설정
    setupNavigation();

    // PDF 내보내기 설정
    setupPDFExport();

    // Socket.IO 연결
    setupSocket();

    // 현재 시간 업데이트 (1초마다)
    setInterval(() => {
        const timeEl = document.getElementById('current-time');
        if (timeEl) {
            timeEl.textContent = formatDateTime(new Date());
        }
    }, 1000);
});
