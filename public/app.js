/**
 * ================================
 * UPKEEP MONITOR - APPLICATION COMPLÈTE
 * ================================
 * 
 * Application de monitoring professionnel inspirée d'UptimeRobot
 * avec authentification, multi-utilisateurs et interface complète
 * 
 * @author ALD
 * @version 2.0.0
 */

class UpKeepMonitorApp {
    constructor() {
        // Configuration de l'application
        this.config = {
            apiBaseUrl: window.location.origin,
            refreshInterval: 30000,
            chartUpdateInterval: 60000,
            maxRetries: 3,
            retryDelay: 1000
        };

        // État de l'application
        this.state = {
            user: null,
            monitors: [],
            activities: [],
            stats: {
                totalMonitors: 0,
                upMonitors: 0,
                downMonitors: 0,
                pausedMonitors: 0,
                avgResponseTime: 0,
                uptime: 99.9
            },
            currentPage: 'dashboard',
            isLoggedIn: false,
            loading: false
        };

        // Pages et éléments DOM
        this.pages = {
            login: document.getElementById('loginPage'),
            register: document.getElementById('registerPage'),
            mainApp: document.getElementById('mainApp')
        };

        this.init();
    }

    /**
     * Initialisation de l'application
     */
    async init() {
        try {
            // Vérification de l'authentification
            await this.checkAuthentication();
            
            // Si connecté, charger l'app
            if (this.state.isLoggedIn) {
                await this.loadApplication();
            }
            
            // Bind des événements
            this.bindAuthEvents();
            this.bindAppEvents();
            
            console.log('UpKeep Monitor initialized');
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Erreur lors de l\'initialisation de l\'application');
        }
    }

    /**
     * Vérification de l'authentification
     */
    async checkAuthentication() {
        try {
            const token = localStorage.getItem('upkeep_token');
            if (!token) {
                this.showLoginPage();
                return;
            }

            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.state.user = userData.user;
                this.state.isLoggedIn = true;
                this.showMainApp();
            } else {
                localStorage.removeItem('upkeep_token');
                this.showLoginPage();
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.showLoginPage();
        }
    }

    /**
     * Chargement de l'application principale
     */
    async loadApplication() {
        try {
            this.setLoading(true);
            
            // Mise à jour de l'interface utilisateur
            this.updateUserProfile();
            
            // Chargement des données
            await Promise.all([
                this.loadMonitors(),
                this.loadStats(),
                this.loadRecentActivity()
            ]);
            
            // Démarrage des mises à jour périodiques
            this.startPeriodicUpdates();
            
        } catch (error) {
            console.error('App loading error:', error);
            this.showError('Erreur lors du chargement des données');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * ================================
     * GESTION DE L'AUTHENTIFICATION
     * ================================
     */

    bindAuthEvents() {
        // Formulaire de connexion
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Formulaire d'inscription
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // Navigation entre pages d'auth
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterPage();
        });

        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginPage();
        });

        // Déconnexion
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.handleLogout();
        });
    }

    async handleLogin() {
        try {
            this.setLoading(true);
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('upkeep_token', data.token);
                this.state.user = data.user;
                this.state.isLoggedIn = true;
                
                this.showMainApp();
                await this.loadApplication();
                
                this.showNotification('Connexion réussie !', 'success');
            } else {
                this.showError(data.message || 'Erreur de connexion');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Erreur lors de la connexion');
        } finally {
            this.setLoading(false);
        }
    }

    async handleRegister() {
        try {
            this.setLoading(true);
            
            const name = document.getElementById('registerName').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirm').value;

            // Validation
            if (password !== confirmPassword) {
                this.showError('Les mots de passe ne correspondent pas');
                return;
            }

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('Compte créé avec succès !', 'success');
                this.showLoginPage();
                
                // Pré-remplir l'email
                document.getElementById('loginEmail').value = email;
            } else {
                this.showError(data.message || 'Erreur lors de la création du compte');
            }
        } catch (error) {
            console.error('Register error:', error);
            this.showError('Erreur lors de la création du compte');
        } finally {
            this.setLoading(false);
        }
    }

    handleLogout() {
        localStorage.removeItem('upkeep_token');
        this.state.user = null;
        this.state.isLoggedIn = false;
        this.state.monitors = [];
        
        // Arrêter les mises à jour périodiques
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.showLoginPage();
        this.showNotification('Déconnexion réussie', 'info');
    }

    /**
     * ================================
     * NAVIGATION ET PAGES
     * ================================
     */

    showLoginPage() {
        this.hideAllPages();
        this.pages.login?.classList.add('active');
    }

    showRegisterPage() {
        this.hideAllPages();
        this.pages.register?.classList.add('active');
    }

    showMainApp() {
        this.hideAllPages();
        this.pages.mainApp?.classList.add('active');
        this.pages.mainApp?.style.display = 'flex';
    }

    hideAllPages() {
        Object.values(this.pages).forEach(page => {
            if (page) {
                page.classList.remove('active');
                page.style.display = 'none';
            }
        });
    }

    bindAppEvents() {
        // Navigation dans l'app
        document.querySelectorAll('.nav-item a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        // Menu mobile
        document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.toggle('active');
        });

        // Bouton d'ajout de monitor
        document.getElementById('addMonitorBtn')?.addEventListener('click', () => {
            this.openMonitorModal();
        });

        document.getElementById('createMonitorBtn')?.addEventListener('click', () => {
            this.openMonitorModal();
        });

        // Formulaire de monitor
        document.getElementById('monitorForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateMonitor();
        });

        // Fermeture de modal
        document.querySelector('.modal-close')?.addEventListener('click', () => {
            this.closeModal();
        });

        // Onglets des paramètres
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.showSettingsTab(tabName);
            });
        });
    }

    navigateTo(page) {
        // Mettre à jour la navigation active
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelector(`[data-page="${page}"]`)?.parentElement.classList.add('active');

        // Afficher la page correspondante
        document.querySelectorAll('.content-page').forEach(contentPage => {
            contentPage.classList.remove('active');
        });
        
        document.getElementById(`${page}Page`)?.classList.add('active');

        // Mettre à jour le titre
        const pageTitle = document.getElementById('pageTitle');
        const titles = {
            dashboard: 'Dashboard',
            monitors: 'Monitors',
            'status-pages': 'Status Pages',
            incidents: 'Incidents',
            alerts: 'Alert Contacts',
            integrations: 'Integrations',
            settings: 'Settings'
        };
        
        if (pageTitle) {
            pageTitle.textContent = titles[page] || 'Dashboard';
        }

        this.state.currentPage = page;

        // Charger les données spécifiques à la page
        this.loadPageData(page);
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboardData();
                break;
            case 'monitors':
                await this.loadMonitorsPageData();
                break;
            case 'settings':
                this.loadSettingsData();
                break;
        }
    }

    /**
     * ================================
     * CHARGEMENT DES DONNÉES
     * ================================
     */

    async loadMonitors() {
        try {
            const response = await this.apiCall('/api/monitors');
            const data = await response.json();
            
            if (data.success) {
                this.state.monitors = data.monitors || [];
                this.updateMonitorsDisplay();
                this.updateStats();
            }
        } catch (error) {
            console.error('Error loading monitors:', error);
        }
    }

    async loadStats() {
        try {
            const response = await this.apiCall('/api/stats');
            const data = await response.json();
            
            if (data.success) {
                this.state.stats = { ...this.state.stats, ...data.stats };
                this.updateStatsDisplay();
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadRecentActivity() {
        try {
            const response = await this.apiCall('/api/activity');
            const data = await response.json();
            
            if (data.success) {
                this.state.activities = data.activities || [];
                this.updateActivityDisplay();
            }
        } catch (error) {
            console.error('Error loading activity:', error);
        }
    }

    async loadDashboardData() {
        await Promise.all([
            this.loadMonitors(),
            this.loadStats(),
            this.loadRecentActivity()
        ]);
        
        this.updateDashboard();
    }

    async loadMonitorsPageData() {
        await this.loadMonitors();
        this.renderMonitorsGrid();
    }

    /**
     * ================================
     * GESTION DES MONITORS
     * ================================
     */

    openMonitorModal() {
        const modal = document.getElementById('monitorModal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    }

    closeModal() {
        const modal = document.getElementById('monitorModal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    }

    async handleCreateMonitor() {
        try {
            this.setLoading(true);
            
            const formData = {
                name: document.getElementById('monitorName').value,
                url: document.getElementById('monitorUrl').value,
                type: document.getElementById('monitorType').value,
                interval: parseInt(document.getElementById('monitorInterval').value)
            };

            const response = await this.apiCall('/api/monitors', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Monitor créé avec succès !', 'success');
                this.closeModal();
                document.getElementById('monitorForm').reset();
                await this.loadMonitors();
            } else {
                this.showError(data.message || 'Erreur lors de la création du monitor');
            }
        } catch (error) {
            console.error('Error creating monitor:', error);
            this.showError('Erreur lors de la création du monitor');
        } finally {
            this.setLoading(false);
        }
    }

    async deleteMonitor(monitorId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce monitor ?')) {
            return;
        }

        try {
            const response = await this.apiCall(`/api/monitors/${monitorId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Monitor supprimé avec succès', 'success');
                await this.loadMonitors();
            } else {
                this.showError(data.message || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Error deleting monitor:', error);
            this.showError('Erreur lors de la suppression du monitor');
        }
    }

    async pauseMonitor(monitorId) {
        try {
            const response = await this.apiCall(`/api/monitors/${monitorId}/pause`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Monitor mis en pause', 'info');
                await this.loadMonitors();
            }
        } catch (error) {
            console.error('Error pausing monitor:', error);
            this.showError('Erreur lors de la pause du monitor');
        }
    }

    /**
     * ================================
     * MISE À JOUR DE L'INTERFACE
     * ================================
     */

    updateUserProfile() {
        if (this.state.user) {
            document.getElementById('userName').textContent = this.state.user.name;
            document.getElementById('userEmail').textContent = this.state.user.email;
        }
    }

    updateDashboard() {
        this.updateStatsDisplay();
        this.updateMonitorsDisplay();
        this.updateActivityDisplay();
    }

    updateStatsDisplay() {
        const stats = this.state.stats;
        
        // Stats du header
        document.getElementById('headerUptime').textContent = `${stats.uptime}%`;
        document.getElementById('headerMonitors').textContent = stats.totalMonitors;

        // Stats cards du dashboard
        document.getElementById('upMonitors').textContent = stats.upMonitors;
        document.getElementById('pausedMonitors').textContent = stats.pausedMonitors;
        document.getElementById('downMonitors').textContent = stats.downMonitors;
        document.getElementById('avgResponseTime').textContent = `${stats.avgResponseTime}ms`;
    }

    updateMonitorsDisplay() {
        const tableBody = document.getElementById('monitorsTableBody');
        if (!tableBody) return;

        if (this.state.monitors.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun monitor configuré</td></tr>';
            return;
        }

        tableBody.innerHTML = this.state.monitors.map(monitor => {
            const statusClass = this.getStatusClass(monitor.status);
            const statusText = this.getStatusText(monitor.status);
            const uptime = this.calculateUptime(monitor);
            const lastCheck = this.formatDateTime(monitor.lastCheck);

            return `
                <tr>
                    <td>
                        <div>
                            <strong>${this.escapeHtml(monitor.name)}</strong>
                            <div style="font-size: 0.8rem; color: var(--gray-500);">${this.escapeHtml(monitor.url)}</div>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                    <td>${uptime}%</td>
                    <td>${lastCheck}</td>
                    <td>${monitor.responseTime || 0}ms</td>
                    <td>
                        <button class="btn btn-small btn-secondary" onclick="app.pauseMonitor(${monitor.id})" title="Pause">
                            <i class="fas fa-pause"></i>
                        </button>
                        <button class="btn btn-small btn-danger" onclick="app.deleteMonitor(${monitor.id})" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderMonitorsGrid() {
        const grid = document.getElementById('monitorsGrid');
        if (!grid) return;

        if (this.state.monitors.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-desktop fa-3x" style="color: var(--gray-400); margin-bottom: 20px;"></i>
                    <h3>Aucun monitor configuré</h3>
                    <p>Commencez par créer votre premier monitor</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.state.monitors.map(monitor => {
            const statusClass = this.getStatusClass(monitor.status);
            const statusText = this.getStatusText(monitor.status);
            const uptime = this.calculateUptime(monitor);

            return `
                <div class="monitor-card">
                    <div class="monitor-card-header">
                        <div class="monitor-name">${this.escapeHtml(monitor.name)}</div>
                        <div class="monitor-url">${this.escapeHtml(monitor.url)}</div>
                    </div>
                    <div class="monitor-card-body">
                        <div class="monitor-stats">
                            <div class="monitor-stat">
                                <span class="monitor-stat-value">${uptime}%</span>
                                <span class="monitor-stat-label">Uptime</span>
                            </div>
                            <div class="monitor-stat">
                                <span class="monitor-stat-value">${monitor.responseTime || 0}ms</span>
                                <span class="monitor-stat-label">Response</span>
                            </div>
                            <div class="monitor-stat">
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                        </div>
                        <div class="monitor-actions">
                            <button class="btn btn-small btn-secondary" onclick="app.pauseMonitor(${monitor.id})">
                                <i class="fas fa-pause"></i>
                            </button>
                            <button class="btn btn-small btn-danger" onclick="app.deleteMonitor(${monitor.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateActivityDisplay() {
        const activityList = document.getElementById('recentActivity');
        if (!activityList || !this.state.activities.length) return;

        activityList.innerHTML = this.state.activities.slice(0, 10).map(activity => {
            const iconClass = activity.type === 'up' ? 'success' : 'danger';
            const icon = activity.type === 'up' ? 'fa-arrow-up' : 'fa-arrow-down';
            const timeAgo = this.timeAgo(activity.timestamp);

            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${this.escapeHtml(activity.message)}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * ================================
     * PARAMÈTRES
     * ================================
     */

    showSettingsTab(tabName) {
        // Mise à jour des onglets
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

        // Affichage du contenu
        document.querySelectorAll('.settings-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}Settings`)?.classList.add('active');
    }

    loadSettingsData() {
        if (this.state.user) {
            document.getElementById('profileName').value = this.state.user.name || '';
            document.getElementById('profileEmail').value = this.state.user.email || '';
        }
    }

    /**
     * ================================
     * MISES À JOUR PÉRIODIQUES
     * ================================
     */

    startPeriodicUpdates() {
        // Mise à jour des données toutes les 30 secondes
        this.updateInterval = setInterval(async () => {
            if (document.hidden) return; // Pas de mise à jour si l'onglet n'est pas visible

            try {
                await this.loadStats();
                if (this.state.currentPage === 'dashboard') {
                    await this.loadRecentActivity();
                }
            } catch (error) {
                console.error('Periodic update error:', error);
            }
        }, this.config.refreshInterval);
    }

    /**
     * ================================
     * UTILITAIRES
     * ================================
     */

    async apiCall(url, options = {}) {
        const token = localStorage.getItem('upkeep_token');
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(this.config.apiBaseUrl + url, finalOptions);
        
        // Gestion des erreurs d'authentification
        if (response.status === 401) {
            localStorage.removeItem('upkeep_token');
            this.state.isLoggedIn = false;
            this.showLoginPage();
            throw new Error('Session expirée');
        }

        return response;
    }

    updateStats() {
        const monitors = this.state.monitors;
        const stats = {
            totalMonitors: monitors.length,
            upMonitors: monitors.filter(m => m.status === 'up').length,
            downMonitors: monitors.filter(m => m.status === 'down').length,
            pausedMonitors: monitors.filter(m => m.status === 'paused').length,
            avgResponseTime: this.calculateAverageResponseTime(monitors)
        };

        // Calcul de l'uptime global
        if (stats.totalMonitors > 0) {
            stats.uptime = ((stats.upMonitors / stats.totalMonitors) * 100).toFixed(1);
        } else {
            stats.uptime = 100;
        }

        this.state.stats = { ...this.state.stats, ...stats };
    }

    calculateAverageResponseTime(monitors) {
        const validTimes = monitors
            .filter(m => m.responseTime && m.responseTime > 0)
            .map(m => m.responseTime);
            
        if (validTimes.length === 0) return 0;
        
        return Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
    }

    calculateUptime(monitor) {
        // Simulation du calcul d'uptime
        // En réalité, cela devrait être basé sur l'historique
        if (monitor.status === 'up') return (95 + Math.random() * 5).toFixed(1);
        if (monitor.status === 'down') return (60 + Math.random() * 30).toFixed(1);
        return (85 + Math.random() * 10).toFixed(1);
    }

    getStatusClass(status) {
        const statusMap = {
            'up': 'success',
            'down': 'danger',
            'paused': 'warning',
            'maintenance': 'info'
        };
        return statusMap[status] || 'secondary';
    }

    getStatusText(status) {
        const statusMap = {
            'up': 'En ligne',
            'down': 'Hors ligne',
            'paused': 'En pause',
            'maintenance': 'Maintenance'
        };
        return statusMap[status] || 'Inconnu';
    }

    formatDateTime(dateString) {
        if (!dateString) return 'Jamais';
        
        return new Intl.DateTimeFormat('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(dateString));
    }

    timeAgo(dateString) {
        if (!dateString) return 'Jamais';
        
        const now = new Date();
        const date = new Date(dateString);
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Il y a quelques secondes';
        if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} minutes`;
        if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)} heures`;
        return `Il y a ${Math.floor(diffInSeconds / 86400)} jours`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setLoading(isLoading) {
        this.state.loading = isLoading;
        
        // Mise à jour de l'interface de chargement
        const loadingElements = document.querySelectorAll('.loading-indicator');
        loadingElements.forEach(el => {
            el.style.display = isLoading ? 'block' : 'none';
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Styles de notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: 'var(--border-radius)',
            color: 'white',
            fontWeight: '600',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease',
            maxWidth: '300px',
            boxShadow: 'var(--shadow-lg)'
        });
        
        // Couleurs par type
        const colors = {
            success: 'var(--success)',
            error: 'var(--danger)',
            warning: 'var(--warning)',
            info: 'var(--info)'
        };
        
        notification.style.background = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Animation d'entrée
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });
        
        // Suppression automatique
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }
}

// ================================
// INITIALISATION GLOBALE
// ================================

// Variable globale pour l'application
let app;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new UpKeepMonitorApp();
        
        // Exposition globale pour les événements onclick
        window.app = app;
        
        console.log('UpKeep Monitor App loaded successfully');
        
    } catch (error) {
        console.error('Failed to initialize UpKeep Monitor:', error);
    }
});

// Gestion des erreurs non capturées
window.addEventListener('error', (event) => {
    console.error('JavaScript Error:', event.error);
    if (app) {
        app.showError('Une erreur inattendue s\'est produite');
    }
});

// Gestion des promesses rejetées
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    if (app) {
        app.showError('Erreur de connexion ou de traitement');
    }
});

// Fermeture de modal avec Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.querySelector('.modal.active');
        if (modal && app) {
            app.closeModal();
        }
    }
});

// Fonctions utilitaires globales pour les événements onclick
window.closeModal = () => app?.closeModal();