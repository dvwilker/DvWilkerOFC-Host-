// Panel HidenCloud Style
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login';
}

const urlParams = new URLSearchParams(window.location.search);
const serverId = urlParams.get('id');

if (!serverId) {
    window.location.href = '/dashboard';
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
};

let consoleInterval;
let currentPath = '/';

// Load user data
async function loadUser() {
    try {
        const res = await fetch('/api/auth/me', { headers });
        const user = await res.json();
        
        document.getElementById('sidebarUsername').textContent = user.username;
        document.getElementById('sidebarPlan').textContent = user.plan.toUpperCase();
    } catch (err) {
        console.error('Error loading user:', err);
        logout();
    }
}

// Load server data
async function loadServerData() {
    try {
        const res = await fetch(`/api/server/${serverId}`, { headers });
        const server = await res.json();
        
        // Update breadcrumb
        document.getElementById('serverNameBreadcrumb').textContent = server.name;
        
        // Update status
        const statusEl = document.getElementById('serverStatus');
        const statusText = server.status === 'running' ? 'En Línea' : 'Apagado';
        statusEl.className = `server-status ${server.status}`;
        statusEl.innerHTML = `
            <span class="status-dot"></span>
            <span class="status-text">${statusText}</span>
        `;
        
        // Update settings tab info
        document.getElementById('serverIdInfo').textContent = server.id;
        document.getElementById('serverStatusInfo').textContent = statusText;
        document.getElementById('serverRepoInfo').textContent = server.repoUrl;
        document.getElementById('serverCreatedInfo').textContent = new Date(server.createdAt).toLocaleDateString();
        
        // Update network tab
        document.getElementById('networkPort').textContent = '24642';
        document.getElementById('networkUrl').textContent = 'noel.hidencloud.com:24642';
        
    } catch (err) {
        console.error('Error loading server:', err);
    }
}

// Tabs functionality
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Remove active from all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active to clicked tab
        btn.classList.add('active');
        document.getElementById(`${tab}-tab`).classList.add('active');
        
        // Load tab content
        if (tab === 'console') {
            startConsoleUpdates();
        } else if (tab === 'files') {
            loadFiles();
        }
    });
});

// Console functions
async function loadConsole() {
    try {
        const res = await fetch(`/api/server/${serverId}/logs`, { headers });
        const data = await res.json();
        
        const output = document.getElementById('consoleOutput');
        output.innerHTML = data.logs.map(line => 
            `<div class="console-line">${escapeHtml(line)}</div>`
        ).join('');
        
        // Auto scroll
        output.scrollTop = output.scrollHeight;
    } catch (err) {
        console.error('Error loading console:', err);
    }
}

function startConsoleUpdates() {
    loadConsole();
    if (consoleInterval) clearInterval(consoleInterval);
    consoleInterval = setInterval(loadConsole, 2000);
}

function clearConsole() {
    document.getElementById('consoleOutput').innerHTML = '<div class="console-line">Consola limpiada</div>';
}

async function sendCommand() {
    const input = document.getElementById('commandInput');
    const command = input.value.trim();
    
    if (!command) return;
    
    try {
        await fetch(`/api/server/${serverId}/command`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ command })
        });
        
        input.value = '';
        setTimeout(loadConsole, 500);
    } catch (err) {
        alert('❌ Error al enviar comando');
    }
}

// Enter key to send command
document.getElementById('commandInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendCommand();
    }
});

// Power actions
async function startServer() {
    try {
        await fetch(`/api/server/${serverId}/start`, { method: 'POST', headers });
        setTimeout(loadServerData, 1000);
    } catch (err) {
        alert('❌ Error al iniciar servidor');
    }
}

async function stopServer() {
    try {
        await fetch(`/api/server/${serverId}/stop`, { method: 'POST', headers });
        setTimeout(loadServerData, 1000);
    } catch (err) {
        alert('❌ Error al detener servidor');
    }
}

async function restartServer() {
    try {
        await fetch(`/api/server/${serverId}/restart`, { method: 'POST', headers });
        setTimeout(loadServerData, 1000);
    } catch (err) {
        alert('❌ Error al reiniciar servidor');
    }
}

// Files functions
async function loadFiles(path = '/') {
    currentPath = path;
    document.getElementById('currentPath').textContent = path;
    
    try {
        const res = await fetch(`/api/server/${serverId}/files?path=${encodeURIComponent(path)}`, { headers });
        const data = await res.json();
        
        const container = document.getElementById('filesList');
        
        if (data.files.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Carpeta vacía</p></div>';
            return;
        }
        
        container.innerHTML = data.files.map(file => `
            <div class="file-item" onclick="${file.isDirectory ? `loadFiles('${path}/${file.name}')` : ''}">
                <div class="file-icon ${file.isDirectory ? 'folder' : 'file'}">
                    <i class="fas fa-${file.isDirectory ? 'folder' : 'file'}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${file.isDirectory ? 'Carpeta' : formatBytes(file.size)}</div>
                </div>
                <div class="file-actions">
                    ${!file.isDirectory ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteFile('${path}/${file.name}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading files:', err);
        document.getElementById('filesList').innerHTML = '<div class="loading">Error al cargar archivos</div>';
    }
}

function refreshFiles() {
    loadFiles(currentPath);
}

async function deleteFile(path) {
    if (!confirm(`¿Eliminar ${path}?`)) return;
    
    try {
        await fetch(`/api/server/${serverId}/files`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ path })
        });
        
        refreshFiles();
    } catch (err) {
        alert('❌ Error al eliminar');
    }
}

// Upload modal
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'block';
    
    try {
        const res = await fetch(`/api/server/${serverId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (res.ok) {
            alert('✅ Archivo subido correctamente');
            closeUploadModal();
            refreshFiles();
        } else {
            alert('❌ Error al subir archivo');
        }
    } catch (err) {
        alert('❌ Error al subir archivo');
    }
    
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('fileInput').value = '';
});

// Startup functions
async function installRepo() {
    const repoUrl = document.getElementById('startupRepoUrl').value.trim();
    const token = document.getElementById('startupToken').value.trim();
    
    if (!repoUrl) {
        alert('❌ Ingresa una URL de repositorio');
        return;
    }
    
    try {
        const res = await fetch(`/api/server/${serverId}/install-repo`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ repoUrl, token: token || undefined })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('✅ Repositorio instalándose... Esto puede tardar unos minutos.');
        } else {
            alert('❌ ' + data.error);
        }
    } catch (err) {
        alert('❌ Error al instalar repositorio');
    }
}

async function updateMainFile() {
    const mainFile = document.getElementById('mainFileInput').value.trim();
    
    if (!mainFile) {
        alert('❌ Ingresa el nombre del archivo principal');
        return;
    }
    
    try {
        const res = await fetch(`/api/server/${serverId}/mainfile`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ mainFile })
        });
        
        if (res.ok) {
            alert('✅ Archivo principal actualizado');
        } else {
            alert('❌ Error al actualizar');
        }
    } catch (err) {
        alert('❌ Error al actualizar');
    }
}

// Settings functions
async function reinstallServer() {
    if (!confirm('⚠️ ¿REINSTALAR SERVIDOR?\n\nEsto ELIMINARÁ TODOS LOS ARCHIVOS del servidor.\n\n¿Estás seguro?')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/server/${serverId}/reinstall`, {
            method: 'POST',
            headers
        });
        
        if (res.ok) {
            alert('✅ Servidor reinstalado correctamente');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            alert('❌ Error al reinstalar');
        }
    } catch (err) {
        alert('❌ Error al reinstalar');
    }
}

async function deleteServer() {
    if (!confirm('⚠️ ¿ELIMINAR SERVIDOR?\n\nEsta acción es PERMANENTE y NO SE PUEDE DESHACER.\n\n¿Estás seguro?')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/server/${serverId}`, {
            method: 'DELETE',
            headers
        });
        
        if (res.ok) {
            alert('✅ Servidor eliminado');
            window.location.href = '/dashboard';
        } else {
            alert('❌ Error al eliminar');
        }
    } catch (err) {
        alert('❌ Error al eliminar');
    }
}

// Utils
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// Initialize
loadUser();
loadServerData();
startConsoleUpdates();
setInterval(loadServerData, 5000);
