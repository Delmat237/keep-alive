/**
 * ================================
 * KEEP-ALIVE SERVICE - CLIENT APP
 * ================================
 * 
 * Service de monitoring et ping automatique pour maintenir
 * les applications web actives sur les plateformes cloud.
 * 
 * @author ALD
 * @version 1.0.0
 */

class VercelKeepAliveService {
    constructor() {
        // Configuration par défaut
        this.config = {
            apiBaseUrl: window.location.origin,
            refreshInterval: 30000, // 30 secondes
            maxRetries: 3,
            retryDelay: 1000,
            maxLogEntries: 100
        };

        // État de l'application
        this.state = {
            services: [],
            intervals: new Map(),
            totalPings: 0,
            successfulPings: 0,
            isLoading: false,
            lastUpdate: null
        };

        // Initialisation
        this.init();
    }

    /**
     * Initialise l'application
     */
    async init() {
        try {
            this.log('🎯 Initialisation du service Keep-Alive (Vercel)');
            
            // Bind des événements
            this.bindEvents();
            
            // Chargement initial des services
            await this.loadServices();
            
            // Mise à jour des statistiques
            this.updateStats();
            
            // Auto-refresh périodique
            this.setupAutoRefresh();
            
            // Gestion de la visibilité de la page
            this.setupVisibilityHandler();
            
            this.log('✅ Service initialisé avec succès');
            
        } catch (error) {
            this.log(`❌ Erreur lors de l'initialisation: ${error.message}`);
            this.handleError(error);
        }
    }

    /**
     * Bind tous les événements de l'interface
     */
    bindEvents() {
        // Formulaire d'ajout de service
        const serviceForm = document.getElementById('serviceForm');
        if (serviceForm) {
            serviceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addService();
            });
        }

        // Bouton de ping manuel
        const manualPingBtn = document.getElementById('manualPingBtn');
        if (manualPingBtn) {
            manualPingBtn.addEventListener('click', () => {
                this.manualPingAll();
            });
        }

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // Gestion des erreurs réseau
        window.addEventListener('online', () => {
            this.log('🌐 Connexion réseau rétablie');
            this.loadServices();
        });

        window.addEventListener('offline', () => {
            this.log('📡 Connexion réseau perdue');
        });
    }

    /**
     * Gère les raccourcis clavier
     */
    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + Enter : Ping manuel
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.manualPingAll();
        }
        
        // Escape : Effacer les logs
        if (event.key === 'Escape') {
            this.clearLogs();
        }
        
        // F5 : Actualiser les services
        if (event.key === 'F5') {
            event.preventDefault();
            this.loadServices();
        }
    }

    /**
     * Configure l'auto-refresh
     */
    setupAutoRefresh() {
        setInterval(async () => {
            if (!document.hidden && navigator.onLine) {
                try {
                    await this.loadServices();
                } catch (error) {
                    this.log(`⚠️ Erreur auto-refresh: ${error.message}`);
                }
            }
        }, this.config.refreshInterval);
    }

    /**
     * Gère la visibilité de la page
     */
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.log('👁️ Page redevenue visible - Actualisation des données');
                this.loadServices();
            }
        });
    }

    /**
     * Ajoute un nouveau service
     */
    async addService() {
        const nameInput = document.getElementById('serviceName');
        const urlInput = document.getElementById('serviceUrl');
        const intervalInput = document.getElementById('interval');

        // Validation des champs
        const name = nameInput?.value?.trim();
        const url = urlInput?.value?.trim();
        const interval = parseInt(intervalInput?.value);

        if (!this.validateServiceInput(name, url, interval)) {
            return;
        }

        // Préparation des données
        const serviceData = {
            name,
            url,
            interval
        };

        this.setLoading(true);
        
        try {
            this.log(`📤 Ajout du service "${name}"...`);
            
            const response = await this.apiCall('/api/services', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(serviceData)
            });

            const result = await response.json();
            
            if (result.success) {
                // Rechargement des services
                await this.loadServices();
                
                // Reset du formulaire
                this.resetForm();
                
                this.log(`✅ Service "${name}" ajouté avec succès`);
                
                // Animation d'ajout
                this.animateNewService(result.data?.id);
                
            } else {
                throw new Error(result.error || 'Erreur lors de l\'ajout');
            }
            
        } catch (error) {
            this.log(`❌ Erreur ajout service: ${error.message}`);
            this.showNotification('Erreur lors de l\'ajout du service', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Valide les données d'entrée du service
     */
    validateServiceInput(name, url, interval) {
        if (!name || name.length < 2) {
            this.log('❌ Le nom du service doit contenir au moins 2 caractères');
            return false;
        }

        if (!url) {
            this.log('❌ L\'URL du service est requise');
            return false;
        }

        // Validation basique de l'URL
        try {
            new URL(url);
        } catch {
            this.log('❌ L\'URL fournie n\'est pas valide');
            return false;
        }

        if (!interval || interval < 1 || interval > 60) {
            this.log('❌ L\'intervalle doit être entre 1 et 60 minutes');
            return false;
        }

        // Vérification des doublons
        const existingService = this.state.services.find(s => 
            s.url.toLowerCase() === url.toLowerCase()
        );
        
        if (existingService) {
            this.log(`❌ Un service avec cette URL existe déjà: ${existingService.name}`);
            return false;
        }

        return true;
    }

    /**
     * Supprime un service
     */
    async removeService(serviceId) {
        const service = this.state.services.find(s => s.id === serviceId);
        if (!service) {
            this.log('❌ Service introuvable');
            return;
        }

        // Confirmation avant suppression
        if (!confirm(`Êtes-vous sûr de vouloir supprimer le service "${service.name}" ?`)) {
            return;
        }

        this.setLoading(true);
        
        try {
            this.log(`🗑️ Suppression du service "${service.name}"...`);
            
            const response = await this.apiCall(`/api/services?id=${serviceId}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            
            if (result.success) {
                // Animation de suppression
                this.animateRemoveService(serviceId);
                
                // Rechargement des services après un délai
                setTimeout(async () => {
                    await this.loadServices();
                    this.log(`✅ Service "${service.name}" supprimé avec succès`);
                }, 300);
                
            } else {
                throw new Error(result.error || 'Erreur lors de la suppression');
            }
            
        } catch (error) {
            this.log(`❌ Erreur suppression: ${error.message}`);
            this.showNotification('Erreur lors de la suppression', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Charge tous les services depuis l'API
     */
    async loadServices() {
        try {
            const response = await this.apiCall('/api/services');
            const result = await response.json();
            
            if (result.success) {
                this.state.services = result.data || [];
                this.state.lastUpdate = new Date();
                
                this.renderServices();
                this.updateStats();
                
            } else {
                throw new Error(result.error || 'Erreur lors du chargement');
            }
            
        } catch (error) {
            this.log(`❌ Erreur chargement: ${error.message}`);
            this.showServicesError('Erreur de connexion à l\'API');
        }
    }

    /**
     * Lance un ping manuel de tous les services
     */
    async manualPingAll() {
        if (this.state.services.length === 0) {
            this.log('⚠️ Aucun service à pinger');
            this.showNotification('Aucun service configuré', 'warning');
            return;
        }

        const btn = document.getElementById('manualPingBtn');
        const originalText = btn?.textContent;
        
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🔄 Ping en cours...';
        }

        this.setLoading(true);

        try {
            this.log(`🚀 Ping manuel de ${this.state.services.length} services`);
            
            const response = await this.apiCall('/api/ping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            
            if (result.success) {
                // Mise à jour des statistiques
                this.state.totalPings = result.stats.totalPings;
                this.state.successfulPings = result.stats.successfulPings;
                
                // Affichage des résultats
                let successCount = 0;
                let errorCount = 0;
                
                result.results.forEach(pingResult => {
                    if (pingResult.status === 'success') {
                        successCount++;
                        const responseTime = pingResult.responseTime ? ` (${pingResult.responseTime}ms)` : '';
                        this.log(`✅ ${pingResult.service} - OK (${pingResult.responseCode})${responseTime}`);
                    } else {
                        errorCount++;
                        this.log(`❌ ${pingResult.service} - ${pingResult.error}`);
                    }
                });
                
                // Rechargement des services
                await this.loadServices();
                
                // Message de résumé
                const summary = `🎯 Ping terminé - ${successCount} succès, ${errorCount} erreurs`;
                this.log(summary);
                
                // Notification
                if (errorCount === 0) {
                    this.showNotification('Tous les services répondent correctement', 'success');
                } else {
                    this.showNotification(`${errorCount} service(s) en erreur`, 'warning');
                }
                
            } else {
                throw new Error(result.error || 'Erreur lors du ping');
            }
            
        } catch (error) {
            this.log(`❌ Erreur ping manuel: ${error.message}`);
            this.showNotification('Erreur lors du ping manuel', 'error');
        } finally {
            this.setLoading(false);
            
            // Restauration du bouton
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || '🔄 Ping manuel de tous les services';
            }
        }
    }

    /**
     * Effectue un appel API avec gestion d'erreurs et retry
     */
    async apiCall(url, options = {}, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            const response = await fetch(this.config.apiBaseUrl + url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    ...options.headers
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
            
        } catch (error) {
            // Retry logic
            if (retryCount < this.config.maxRetries && navigator.onLine) {
                await this.sleep(this.config.retryDelay * (retryCount + 1));
                return this.apiCall(url, options, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Rend la liste des services dans le DOM
     */
    renderServices() {
        const container = document.getElementById('servicesList');
        if (!container) return;
        
        if (this.state.services.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🎯</div>
                    <h3>Aucun service configuré</h3>
                    <p>Ajoutez votre premier service ci-dessus pour commencer le monitoring !</p>
                </div>
            `;
            return;
        }

        const servicesHtml = this.state.services.map(service => {
            const lastPing = service.lastPing 
                ? this.formatDateTime(new Date(service.lastPing))
                : 'Jamais';
            
            const statusClass = this.getStatusClass(service.status);
            const statusText = this.getStatusText(service.status);
            const uptime = this.calculateUptime(service);
            
            return `
                <div class="service-item" data-service-id="${service.id}">
                    <div class="service-info">
                        <h3>${this.escapeHtml(service.name)}</h3>
                        <div class="service-details">
                            <div>📍 <strong>URL:</strong> ${this.escapeHtml(service.url)}</div>
                            <div>⏱️ <strong>Intervalle:</strong> ${service.interval} minutes</div>
                            <div>🕐 <strong>Dernier ping:</strong> ${lastPing}</div>
                            <div>⚠️ <strong>Erreurs:</strong> ${service.errorCount || 0}</div>
                            ${uptime ? `<div>📊 <strong>Uptime:</strong> ${uptime}</div>` : ''}
                            ${service.responseTime ? `<div>⚡ <strong>Temps de réponse:</strong> ${service.responseTime}ms</div>` : ''}
                        </div>
                    </div>
                    <div class="service-status">
                        <div class="status-indicator ${statusClass}" title="${statusText}"></div>
                        <button class="btn btn-danger" onclick="keepAlive.removeService(${service.id})" title="Supprimer ce service">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = servicesHtml;
    }

    /**
     * Met à jour les statistiques affichées
     */
    updateStats() {
        const elements = {
            totalServices: document.getElementById('totalServices'),
            totalPings: document.getElementById('totalPings'),
            successRate: document.getElementById('successRate')
        };

        if (elements.totalServices) {
            elements.totalServices.textContent = this.state.services.length;
        }

        if (elements.totalPings) {
            elements.totalPings.textContent = this.state.totalPings.toLocaleString();
        }

        if (elements.successRate) {
            const successRate = this.state.totalPings > 0 
                ? Math.round((this.state.successfulPings / this.state.totalPings) * 100)
                : 100;
            elements.successRate.textContent = successRate + '%';
            
            // Couleur basée sur le taux de succès
            const element = elements.successRate;
            element.style.color = successRate >= 95 ? '#28a745' : 
                                 successRate >= 85 ? '#ffc107' : '#dc3545';
        }
    }

    /**
     * Ajoute une entrée dans les logs
     */
    log(message, type = 'info') {
        const logs = document.getElementById('logs');
        if (!logs) return;
        
        const timestamp = this.formatDateTime(new Date());
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        // Animation d'entrée
        logEntry.style.opacity = '0';
        logEntry.style.transform = 'translateX(-10px)';
        
        logs.insertBefore(logEntry, logs.firstChild);
        
        // Animation
        requestAnimationFrame(() => {
            logEntry.style.transition = 'all 0.3s ease';
            logEntry.style.opacity = '1';
            logEntry.style.transform = 'translateX(0)';
        });
        
        // Limitation du nombre de logs
        while (logs.children.length > this.config.maxLogEntries) {
            logs.removeChild(logs.lastChild);
        }
        
        // Scroll automatique vers le haut pour les nouveaux logs
        logs.scrollTop = 0;
    }

    /**
     * Efface tous les logs
     */
    clearLogs() {
        const logs = document.getElementById('logs');
        if (logs) {
            logs.innerHTML = '';
            this.log('🧹 Logs effacés');
        }
    }

    /**
     * Réinitialise le formulaire
     */
    resetForm() {
        const form = document.getElementById('serviceForm');
        if (form) {
            form.reset();
            
            // Focus sur le premier champ
            const firstInput = form.querySelector('input');
            if (firstInput) {
                firstInput.focus();
            }
        }
    }

    /**
     * Affiche l'état de chargement
     */
    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        
        // Mise à jour de l'interface
        const loadingElements = document.querySelectorAll('.loading-indicator');
        loadingElements.forEach(el => {
            el.style.display = isLoading ? 'block' : 'none';
        });
    }

    /**
     * Gère les erreurs générales
     */
    handleError(error) {
        console.error('Keep-Alive Service Error:', error);
        
        // Log visible pour l'utilisateur
        this.log(`💥 Erreur système: ${error.message}`, 'error');
        
        // Notification utilisateur
        this.showNotification('Une erreur est survenue', 'error');
    }

    /**
     * Affiche une notification utilisateur
     */
    showNotification(message, type = 'info') {
        // Création d'une notification simple
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Styles inline pour la notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '10px',
            color: 'white',
            fontWeight: '600',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease',
            maxWidth: '300px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        });
        
        // Couleur selon le type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#667eea'
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

    /**
     * Affiche une erreur dans la liste des services
     */
    showServicesError(message) {
        const container = document.getElementById('servicesList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="border-color: #dc3545; color: #dc3545;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                    <h3>Erreur de connexion</h3>
                    <p>${this.escapeHtml(message)}</p>
                    <button class="btn btn-primary" onclick="keepAlive.loadServices()" style="margin-top: 15px;">
                        🔄 Réessayer
                    </button>
                </div>
            `;
        }
    }

    /**
     * Anime l'ajout d'un nouveau service
     */
    animateNewService(serviceId) {
        setTimeout(() => {
            const serviceElement = document.querySelector(`[data-service-id="${serviceId}"]`);
            if (serviceElement) {
                serviceElement.classList.add('new-service');
                setTimeout(() => {
                    serviceElement.classList.remove('new-service');
                }, 500);
            }
        }, 100);
    }

    /**
     * Anime la suppression d'un service
     */
    animateRemoveService(serviceId) {
        const serviceElement = document.querySelector(`[data-service-id="${serviceId}"]`);
        if (serviceElement) {
            serviceElement.classList.add('removing');
        }
    }

    // ================================
    // MÉTHODES UTILITAIRES
    // ================================

    /**
     * Détermine la classe CSS du statut
     */
    getStatusClass(status) {
        const statusMap = {
            'active': '',
            'warning': 'warning',
            'error': 'error'
        };
        return statusMap[status] || '';
    }

    /**
     * Retourne le texte du statut
     */
    getStatusText(status) {
        const statusMap = {
            'active': 'Service actif',
            'warning': 'Service avec des erreurs récentes',
            'error': 'Service en erreur'
        };
        return statusMap[status] || 'Statut inconnu';
    }

    /**
     * Calcule l'uptime d'un service
     */
    calculateUptime(service) {
        if (!service.created || !service.lastPing) return null;
        
        const created = new Date(service.created);
        const lastPing = new Date(service.lastPing);
        const now = new Date();
        
        const totalTime = now - created;
        const errorCount = service.errorCount || 0;
        
        // Estimation simple basée sur le nombre d'erreurs
        const estimatedUptime = Math.max(0, 100 - (errorCount * 5));
        
        return `${estimatedUptime.toFixed(1)}%`;
    }

    /**
     * Formate une date/heure
     */
    formatDateTime(date) {
        if (!date) return 'N/A';
        
        return new Intl.DateTimeFormat('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(date);
    }

    /**
     * Échappe le HTML pour éviter les injections XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Fonction d'attente (sleep)
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Obtient les informations de performance
     */
    getPerformanceInfo() {
        return {
            services: this.state.services.length,
            totalPings: this.state.totalPings,
            successRate: this.state.totalPings > 0 
                ? (this.state.successfulPings / this.state.totalPings * 100).toFixed(2) + '%'
                : '100%',
            lastUpdate: this.state.lastUpdate,
            uptime: this.calculateSystemUptime()
        };
    }

    /**
     * Calcule l'uptime du système
     */
    calculateSystemUptime() {
        const startTime = sessionStorage.getItem('keepAlive_startTime');
        if (!startTime) {
            sessionStorage.setItem('keepAlive_startTime', Date.now().toString());
            return '0m';
        }
        
        const uptimeMs = Date.now() - parseInt(startTime);
        const uptimeMinutes = Math.floor(uptimeMs / 60000);
        
        if (uptimeMinutes < 60) {
            return `${uptimeMinutes}m`;
        } else if (uptimeMinutes < 1440) {
            return `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`;
        } else {
            const days = Math.floor(uptimeMinutes / 1440);
            const hours = Math.floor((uptimeMinutes % 1440) / 60);
            return `${days}j ${hours}h`;
        }
    }

    /**
     * Exporte les données de configuration
     */
    exportConfiguration() {
        const config = {
            services: this.state.services,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };
        
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `keep-alive-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.log('📤 Configuration exportée');
    }

    /**
     * Affiche les informations de debug
     */
    showDebugInfo() {
        const info = this.getPerformanceInfo();
        const debugInfo = [
            `🔧 Keep-Alive Service v1.0.0`,
            `📊 Services: ${info.services}`,
            `📡 Total pings: ${info.totalPings}`,
            `✅ Taux de succès: ${info.successRate}`,
            `⏰ Uptime: ${info.uptime}`,
            `🔄 Dernière MAJ: ${info.lastUpdate ? this.formatDateTime(info.lastUpdate) : 'Jamais'}`,
            `🌐 Statut réseau: ${navigator.onLine ? 'En ligne' : 'Hors ligne'}`,
            `👁️ Page visible: ${document.hidden ? 'Non' : 'Oui'}`
        ];
        
        debugInfo.forEach(line => this.log(line));
    }
}

// ================================
// INITIALISATION GLOBALE
// ================================

// Variable globale pour l'accès depuis le HTML
let keepAlive;

// Initialisation quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    try {
        keepAlive = new VercelKeepAliveService();
        
        // Exposition globale pour les événements onclick
        window.keepAlive = keepAlive;
        
        // Commandes de debug disponibles dans la console
        window.keepAliveDebug = {
            info: () => keepAlive.showDebugInfo(),
            export: () => keepAlive.exportConfiguration(),
            clear: () => keepAlive.clearLogs(),
            ping: () => keepAlive.manualPingAll(),
            reload: () => keepAlive.loadServices()
        };
        
        console.log('🎯 Keep-Alive Service initialisé');
        console.log('💡 Commandes debug disponibles: keepAliveDebug');
        
    } catch (error) {
        console.error('❌ Erreur d\'initialisation:', error);
    }
});

// Gestion des erreurs non capturées
window.addEventListener('error', (event) => {
    console.error('Erreur JavaScript:', event.error);
    if (keepAlive) {
        keepAlive.log(`💥 Erreur JS: ${event.error?.message || 'Erreur inconnue'}`, 'error');
    }
});

// Gestion des rejets de promesses non capturées
window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesse rejetée:', event.reason);
    if (keepAlive) {
        keepAlive.log(`💥 Promesse rejetée: ${event.reason?.message || 'Erreur inconnue'}`, 'error');
    }
});

// ================================
// HOOKS DE DÉVELOPPEMENT
// ================================

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.log('🔧 Mode développement détecté');
    
    // Hot reload pour le développement
    if (window.EventSource) {
        const evtSource = new EventSource('/dev/reload');
        evtSource.onmessage = () => {
            console.log('🔄 Rechargement automatique');
            window.location.reload();
        };
    }
}