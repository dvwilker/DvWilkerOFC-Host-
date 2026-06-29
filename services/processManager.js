const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const treeKill = require('tree-kill');
const pidusage = require('pidusage');

class ProcessManager {
    constructor() {
        this.processes = new Map(); // serverId -> { process, status, logs }
        this.consoleHistory = new Map(); // serverId -> array of log lines
        this.maxHistoryLines = 500;
    }

    // Obtener info del servidor
    getServerInfo(serverId) {
        const proc = this.processes.get(serverId);
        return {
            status: proc?.status || 'offline',
            pid: proc?.process?.pid || null,
            uptime: proc?.startTime ? Date.now() - proc.startTime : 0
        };
    }

    // Obtener historial de consola
    getConsoleHistory(serverId) {
        return this.consoleHistory.get(serverId) || [];
    }

    // Agregar línea al historial
    addToHistory(serverId, line, type = 'stdout') {
        if (!this.consoleHistory.has(serverId)) {
            this.consoleHistory.set(serverId, []);
        }
        const history = this.consoleHistory.get(serverId);
        const entry = {
            time: new Date().toISOString(),
            type,
            text: line
        };
        history.push(entry);
        
        // Limitar historial
        if (history.length > this.maxHistoryLines) {
            history.shift();
        }

        // Broadcast a clientes conectados
        if (global.broadcastToServer) {
            global.broadcastToServer(serverId, { type: 'log', data: entry });
        }
    }

    // Iniciar servidor
    async start(serverId, serverPath, mainFile = 'index.js') {
        if (this.processes.has(serverId) && this.processes.get(serverId).status === 'running') {
            throw new Error('El servidor ya está corriendo');
        }

        const fullPath = path.resolve(serverPath);
        const mainFilePath = path.join(fullPath, mainFile);

        if (!fs.existsSync(mainFilePath)) {
            throw new Error(`Archivo principal no encontrado: ${mainFile}`);
        }

        // Limpiar historial anterior
        this.consoleHistory.set(serverId, []);
        
        this.addToHistory(serverId, `🚀 Iniciando servidor...`, 'system');
        this.addToHistory(serverId, `📁 Directorio: ${fullPath}`, 'system');
        this.addToHistory(serverId, `📄 Archivo: ${mainFile}`, 'system');

        return new Promise((resolve, reject) => {
            try {
                const proc = spawn('node', [mainFile], {
                    cwd: fullPath,
                    env: { ...process.env, FORCE_COLOR: '1' },
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                this.processes.set(serverId, {
                    process: proc,
                    status: 'running',
                    startTime: Date.now(),
                    path: fullPath,
                    mainFile
                });

                proc.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n').filter(l => l.trim());
                    lines.forEach(line => this.addToHistory(serverId, line, 'stdout'));
                });

                proc.stderr.on('data', (data) => {
                    const lines = data.toString().split('\n').filter(l => l.trim());
                    lines.forEach(line => this.addToHistory(serverId, line, 'stderr'));
                });

                proc.on('close', (code) => {
                    const procData = this.processes.get(serverId);
                    if (procData) {
                        procData.status = 'offline';
                        procData.process = null;
                    }
                    this.addToHistory(serverId, `⏹️ Servidor detenido (código: ${code})`, 'system');
                    
                    if (global.broadcastToServer) {
                        global.broadcastToServer(serverId, { type: 'status', data: 'offline' });
                    }
                });

                proc.on('error', (err) => {
                    this.addToHistory(serverId, `❌ Error: ${err.message}`, 'error');
                    reject(err);
                });

                // Esperar un momento para ver si arranca bien
                setTimeout(() => {
                    const procData = this.processes.get(serverId);
                    if (procData && procData.status === 'running') {
                        if (global.broadcastToServer) {
                            global.broadcastToServer(serverId, { type: 'status', data: 'running' });
                        }
                        resolve({ success: true, pid: proc.pid });
                    }
                }, 1000);

            } catch (err) {
                reject(err);
            }
        });
    }

    // Detener servidor
    async stop(serverId) {
        const procData = this.processes.get(serverId);
        if (!procData || !procData.process) {
            throw new Error('El servidor no está corriendo');
        }

        this.addToHistory(serverId, `🛑 Deteniendo servidor...`, 'system');

        return new Promise((resolve, reject) => {
            const pid = procData.process.pid;
            
            treeKill(pid, 'SIGTERM', (err) => {
                if (err) {
                    // Intentar con SIGKILL
                    treeKill(pid, 'SIGKILL', (err2) => {
                        if (err2) {
                            reject(new Error('No se pudo detener el servidor'));
                        } else {
                            procData.status = 'offline';
                            procData.process = null;
                            resolve({ success: true });
                        }
                    });
                } else {
                    procData.status = 'offline';
                    procData.process = null;
                    resolve({ success: true });
                }
            });
        });
    }

    // Reiniciar servidor
    async restart(serverId) {
        const procData = this.processes.get(serverId);
        if (!procData) {
            throw new Error('Servidor no encontrado');
        }

        const { path: serverPath, mainFile } = procData;

        if (procData.status === 'running') {
            await this.stop(serverId);
            // Esperar un momento antes de reiniciar
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return this.start(serverId, serverPath, mainFile);
    }

    // Enviar comando al proceso
    sendCommand(serverId, command) {
        const procData = this.processes.get(serverId);
        if (!procData || !procData.process || procData.status !== 'running') {
            this.addToHistory(serverId, `⚠️ No se puede enviar comando: servidor offline`, 'system');
            return false;
        }

        this.addToHistory(serverId, `> ${command}`, 'stdin');
        procData.process.stdin.write(command + '\n');
        return true;
    }

    // Obtener uso de recursos
    async getStats(serverId) {
        const procData = this.processes.get(serverId);
        if (!procData || !procData.process || procData.status !== 'running') {
            return { cpu: 0, memory: 0, uptime: 0 };
        }

        try {
            const stats = await pidusage(procData.process.pid);
            return {
                cpu: Math.round(stats.cpu * 100) / 100,
                memory: Math.round(stats.memory / 1024 / 1024 * 100) / 100, // MB
                uptime: Date.now() - procData.startTime
            };
        } catch (err) {
            return { cpu: 0, memory: 0, uptime: 0 };
        }
    }

    // Kill forzado
    async kill(serverId) {
        const procData = this.processes.get(serverId);
        if (!procData || !procData.process) {
            return { success: true };
        }

        this.addToHistory(serverId, `💀 Matando proceso...`, 'system');

        return new Promise((resolve) => {
            treeKill(procData.process.pid, 'SIGKILL', () => {
                procData.status = 'offline';
                procData.process = null;
                resolve({ success: true });
            });
        });
    }
}

// Singleton
let instance = null;
function getProcessManager() {
    if (!instance) {
        instance = new ProcessManager();
    }
    return instance;
}

module.exports = { ProcessManager, getProcessManager };
