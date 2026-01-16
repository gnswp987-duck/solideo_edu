const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 시스템 정보 수신 리스너
    onSystemInfo: (callback) => {
        ipcRenderer.on('system-info', (event, data) => callback(data));
    },

    // 시스템 정보 직접 요청
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

    // 윈도우 컨트롤
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // 리스너 제거
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});
