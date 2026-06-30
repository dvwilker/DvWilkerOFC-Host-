// Dashboard HidenCloud Style
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login';
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
};

// Load user data
async function loadUser() {
    try {
        const res = await fetch('/api/auth/me', { headers });
        const user = await res.json();
        
        // Sidebar
        document.getElementById('sidebarUsername').textContent = user.username;
        document.getElementById('sidebarPlan').textContent = user.plan.toUpperCase();
        
        // Header
        document.getElementById('headerUsername').textContent = user.username;
        document.getElementById('headerCoins').textContent = user.coins || 0;
        document.getElementById('totalCoins').textContent = user.coins || 0;
        
        // Show admin nav if admin
        if (user.isAdmin) {
            document.getElementById('adminNav').style.display = 'flex';
        }
    } catch (err) {
        console.error('Error loading user:', err);
        logout();
    }
}

// Load servers
async function loadServers() {
    try {
        const res = await fetch('/api/server/list', { headers });
        const data = await res.json();
        
        // Update stats
        document.getElementById('totalServers').textContent = data.servers.length;
        document.getElementById('onlineServers').textContent = data.servers.filter(s => s.status === 'running').length;
        document.getElementById('availableRam').textContent = `${data.limits.ram} MB`;
        
        const container = document.getElementById('serversList');
        
        if (data.servers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-server"></i>
                    <h3>No tienes servidores</h3>
                    <p>Crea tu primer servidor para comenzar</p>
                    <button class="btn btn-primary" onclick="openCreateModal()">
                        <i class="fas fa-plus"></i> Crear Servidor
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.servers.map(server => `
            <div class="server-card">
                <div class="server-card-info">
                    <div class="server-card-header">
                        <span class="status-badge ${server.status}">
                            ${server.status === 'running' ? '🟢 En Línea' : '⚫ Apagado'}
                        </span>
                        <span class="server-card-name">${server.name}</span>
                    </div>
                    <div class="server-card-meta">
                        <i class="fab fa-github"></i> ${server.repoUrl}
                    </div>
                </div>
                <div class="server-card-actions">
                    <a href="/panel-hiden?id=${server.id}" class="btn btn-primary btn-sm">
                        <i class="fas fa-terminal"></i> Gestionar
                    </a>
                    <button class="btn btn-danger btn-sm" onclick="deleteServer('${server.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error loading servers:', err);
    }
}

// Toggle user menu
function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('active');
}

// Close menu on click outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    const btn = e.target.closest('.user-btn');
    if (!btn && !e.target.closest('.dropdown-menu')) {
        menu.classList.remove('active');
    }
});

// Modal functions
function openCreateModal() {
    document.getElementById('createModal').classList.add('active');
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
}

// Create server
document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('createBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clonando...';
    
    try {
        const res = await fetch('/api/server/create', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: document.getElementById('serverName').value,
                repoUrl: document.getElementById('repoUrl').value,
                mainFile: document.getElementById('mainFile').value || 'index.js'
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeCreateModal();
            setTimeout(loadServers, 3000);
            alert('✅ Servidor creándose... El repositorio se está clonando.');
        } else {
            alert('❌ ' + data.error);
        }
    } catch (err) {
        alert('❌ Error al crear servidor');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-clone"></i> Clonar y Crear';
});

// Delete server
async function deleteServer(id) {
    if (!confirm('¿Estás seguro de eliminar este servidor? Se borrarán todos los archivos.')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/server/${id}`, {
            method: 'DELETE',
            headers
        });
        
        if (res.ok) {
            loadServers();
        }
    } catch (err) {
        alert('❌ Error al eliminar');
    }
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// Initialize
loadUser();
loadServers();
setInterval(loadServers, 10000);
