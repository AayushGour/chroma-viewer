/**
 * Chroma Database Explorer - Main JavaScript File
 * 
 * A comprehensive Single Page Application for exploring Chroma vector databases.
 * Supports both local and remote connections with automatic API format detection.
 * 
 * Features:
 * - Real-time connection management
 * - Collection browsing and data visualization
 * - Configurable connection settings with localStorage persistence
 * - CORS proxy support for remote connections
 * - Multiple view modes (table/JSON)
 * - Search and filtering capabilities
 * 
 * @author Chroma Database Explorer Team
 * @version 1.0.0
 */

class ChromaExplorer {
    constructor() {
        // Default connection settings
        this.defaultConfig = {
            host: 'localhost',
            port: 8003,
            protocol: 'http',
            basePath: ''
        };

        // Load saved configuration or use defaults
        this.config = this.loadConfig();
        this.baseUrl = this.buildBaseUrl();

        this.currentCollection = null;
        this.collections = [];
        this.currentData = [];
        this.filteredData = [];
        this.currentView = 'table';

        this.initializeElements();
        this.attachEventListeners();
        this.initializeConfigForm();
        this.initializeApp();
    }

    initializeElements() {
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');

        // Collection elements
        this.collectionsLoading = document.getElementById('collectionsLoading');
        this.collectionsList = document.getElementById('collectionsList');
        this.noCollections = document.getElementById('noCollections');
        this.refreshBtn = document.getElementById('refreshBtn');

        // Content elements
        this.collectionInfo = document.getElementById('collectionInfo');
        this.collectionName = document.getElementById('collectionName');
        this.documentCount = document.getElementById('documentCount');
        this.welcomeMessage = document.getElementById('welcomeMessage');
        this.dataLoading = document.getElementById('dataLoading');
        this.dataTableContainer = document.getElementById('dataTableContainer');
        this.dataTable = document.getElementById('dataTable');
        this.dataJson = document.getElementById('dataJson');
        this.noData = document.getElementById('noData');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.retryBtn = document.getElementById('retryBtn');

        // Control elements
        this.searchInput = document.getElementById('searchInput');
        this.viewBtns = document.querySelectorAll('.view-btn');

        // Configuration elements
        this.configBtn = document.getElementById('configBtn');
        this.configModal = document.getElementById('configModal');
        this.closeConfigBtn = document.getElementById('closeConfigBtn');
        this.hostInput = document.getElementById('hostInput');
        this.portInput = document.getElementById('portInput');
        this.protocolSelect = document.getElementById('protocolSelect');
        this.basePath = document.getElementById('basePath');
        this.urlPreview = document.getElementById('urlPreview');
        this.resetConfigBtn = document.getElementById('resetConfigBtn');
        this.testConnectionBtn = document.getElementById('testConnectionBtn');
        this.saveConfigBtn = document.getElementById('saveConfigBtn');
    }

    attachEventListeners() {
        this.refreshBtn.addEventListener('click', () => this.refreshCollections());
        this.retryBtn.addEventListener('click', () => this.loadCurrentCollection());
        this.searchInput.addEventListener('input', (e) => this.filterData(e.target.value));

        this.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchView(btn.dataset.view));
        });

        // Configuration modal events
        this.configBtn.addEventListener('click', () => this.openConfigModal());
        this.closeConfigBtn.addEventListener('click', () => this.closeConfigModal());
        this.resetConfigBtn.addEventListener('click', () => this.resetConfig());
        this.testConnectionBtn.addEventListener('click', () => this.testConfigConnection());
        this.saveConfigBtn.addEventListener('click', () => this.saveConfig());

        // Update URL preview when inputs change
        [this.hostInput, this.portInput, this.protocolSelect, this.basePath].forEach(input => {
            input.addEventListener('input', () => this.updateUrlPreview());
        });

        // Close modal when clicking outside
        this.configModal.addEventListener('click', (e) => {
            if (e.target === this.configModal) {
                this.closeConfigModal();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.configModal.style.display !== 'none') {
                this.closeConfigModal();
            }
        });
    }

    async initializeApp() {
        this.updateConnectionStatus('connecting');
        await this.testConnection();
        await this.loadCollections();
    }

    updateConnectionStatus(status) {
        const statusText = this.connectionStatus.querySelector('span');
        this.connectionStatus.className = `connection-status ${status}`;

        switch (status) {
            case 'connected':
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
        }
    }

    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/heartbeat`);
            if (response.ok) {
                this.updateConnectionStatus('connected');
                return true;
            } else {
                this.updateConnectionStatus('disconnected');
                return false;
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            this.updateConnectionStatus('disconnected');
            return false;
        }
    }

    async loadCollections() {
        this.showCollectionsLoading(true);

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/collections`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const collections = await response.json();
            this.collections = collections;
            this.renderCollections();

        } catch (error) {
            console.error('Failed to load collections:', error);
            this.showError('Failed to load collections', error.message);
        } finally {
            this.showCollectionsLoading(false);
        }
    }

    async refreshCollections() {
        this.refreshBtn.querySelector('i').classList.add('spinning');
        await this.loadCollections();
        setTimeout(() => {
            this.refreshBtn.querySelector('i').classList.remove('spinning');
        }, 500);
    }

    renderCollections() {
        if (this.collections.length === 0) {
            this.collectionsList.style.display = 'none';
            this.noCollections.style.display = 'block';
            return;
        }

        this.collectionsList.style.display = 'block';
        this.noCollections.style.display = 'none';

        this.collectionsList.innerHTML = this.collections.map(collection => `
            <div class="collection-item" data-collection="${collection.name}" data-collection-id="${collection.id}" onclick="chromaExplorer.selectCollection('${collection.name}', '${collection.id}')">
                <h3>${collection.name}</h3>
                <p>ID: ${collection.id}</p>
            </div>
        `).join('');
    }

    async selectCollection(collectionName, collectionId) {
        // Update UI selection
        document.querySelectorAll('.collection-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-collection="${collectionName}"]`).classList.add('active');

        this.currentCollection = collectionName;
        this.currentCollectionId = collectionId;
        this.hideAllContentStates();
        this.showDataLoading(true);

        try {
            await this.loadCollectionData(collectionName, collectionId);
        } catch (error) {
            this.showError('Failed to load collection data', error.message);
        }
    }

    async loadCollectionData(collectionName, collectionId) {
        try {
            if (!collectionId) {
                throw new Error('Collection ID is required but not provided');
            }

            // Get collection info using collection ID
            const collectionResponse = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/get`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            });
            if (!collectionResponse.ok) {
                throw new Error(`Failed to get collection info: ${collectionResponse.status}`);
            }
            const collectionInfo = await collectionResponse.json();

            // Get collection data with metadata using collection ID
            const dataResponse = await this.tryMultipleApiFormats(collectionName, collectionId);

            if (!dataResponse.ok) {
                let errorMessage = `HTTP ${dataResponse.status} - ${dataResponse.statusText}`;
                try {
                    const errorBody = await dataResponse.text();
                    errorMessage += `\nResponse: ${errorBody}`;
                } catch (e) {
                    // Error reading response body
                }
                throw new Error(`Failed to get collection data: ${errorMessage}`);
            }

            const data = await dataResponse.json();
            this.processCollectionData(collectionInfo, data);

        } catch (error) {
            console.error('Error loading collection data:', error);
            throw error;
        }
    }

    processCollectionData(collectionInfo, data) {
        this.showDataLoading(false);

        // Update collection info
        this.collectionName.textContent = collectionInfo.name;
        this.documentCount.textContent = data.ids ? data.ids.length : 0;
        this.collectionInfo.style.display = 'block';

        if (!data.ids || data.ids.length === 0) {
            this.showNoData();
            return;
        }

        // Process data into table format
        this.currentData = this.formatDataForDisplay(data);
        this.filteredData = [...this.currentData];
        this.renderData();
        this.dataTableContainer.style.display = 'block';
    }

    formatDataForDisplay(data) {
        const { ids, documents, metadatas, embeddings } = data;
        const formattedData = [];

        for (let i = 0; i < ids.length; i++) {
            const row = {
                id: ids[i],
                document: documents && documents[i] ? documents[i] : null,
                metadata: metadatas && metadatas[i] ? metadatas[i] : null,
                embedding: embeddings && embeddings[i] ? embeddings[i] : null
            };
            formattedData.push(row);
        }

        return formattedData;
    }

    renderData() {
        if (this.currentView === 'table') {
            this.renderTableView();
            this.dataTable.style.display = 'block';
            this.dataJson.style.display = 'none';
        } else {
            this.renderJsonView();
            this.dataTable.style.display = 'none';
            this.dataJson.style.display = 'block';
        }
    }

    renderTableView() {
        if (this.filteredData.length === 0) {
            this.dataTable.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-light);">No data matches your search criteria.</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'table';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        const headers = ['ID', 'Document', 'Metadata', 'Embedding'];
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');

        this.filteredData.forEach(row => {
            const tr = document.createElement('tr');

            // ID cell
            const idCell = document.createElement('td');
            idCell.textContent = row.id;
            tr.appendChild(idCell);

            // Document cell
            const docCell = document.createElement('td');
            const docContent = document.createElement('div');
            docContent.className = 'cell-content';
            docContent.textContent = row.document || 'N/A';
            docCell.appendChild(docContent);
            tr.appendChild(docCell);

            // Metadata cell
            const metaCell = document.createElement('td');
            const metaContent = document.createElement('div');
            metaContent.className = 'cell-content';
            if (row.metadata) {
                const jsonDiv = document.createElement('div');
                jsonDiv.className = 'json-cell';
                jsonDiv.textContent = JSON.stringify(row.metadata, null, 2);
                metaContent.appendChild(jsonDiv);
            } else {
                metaContent.textContent = 'N/A';
            }
            metaCell.appendChild(metaContent);
            tr.appendChild(metaCell);

            // Embedding cell
            const embCell = document.createElement('td');
            const embContent = document.createElement('div');
            embContent.className = 'cell-content';
            if (row.embedding) {
                embContent.textContent = `[${row.embedding.length} dimensions]`;
                embContent.title = `First 5 values: ${row.embedding.slice(0, 5).join(', ')}...`;
            } else {
                embContent.textContent = 'N/A';
            }
            embCell.appendChild(embContent);
            tr.appendChild(embCell);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.dataTable.innerHTML = '';
        this.dataTable.appendChild(table);
    }

    renderJsonView() {
        const jsonContainer = document.createElement('div');
        jsonContainer.className = 'json-container';
        jsonContainer.textContent = JSON.stringify(this.filteredData, null, 2);

        this.dataJson.innerHTML = '';
        this.dataJson.appendChild(jsonContainer);
    }

    filterData(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredData = [...this.currentData];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredData = this.currentData.filter(row => {
                return (
                    row.id.toLowerCase().includes(term) ||
                    (row.document && row.document.toLowerCase().includes(term)) ||
                    (row.metadata && JSON.stringify(row.metadata).toLowerCase().includes(term))
                );
            });
        }
        this.renderData();
    }

    switchView(view) {
        this.currentView = view;
        this.viewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.renderData();
    }

    loadCurrentCollection() {
        if (this.currentCollection && this.currentCollectionId) {
            this.selectCollection(this.currentCollection, this.currentCollectionId);
        }
    }

    // UI State Management
    hideAllContentStates() {
        this.welcomeMessage.style.display = 'none';
        this.dataLoading.style.display = 'none';
        this.dataTableContainer.style.display = 'none';
        this.noData.style.display = 'none';
        this.errorMessage.style.display = 'none';
        this.collectionInfo.style.display = 'none';
    }

    showCollectionsLoading(show) {
        this.collectionsLoading.style.display = show ? 'flex' : 'none';
        this.collectionsList.style.display = show ? 'none' : 'block';
        this.noCollections.style.display = 'none';
    }

    showDataLoading(show) {
        this.dataLoading.style.display = show ? 'flex' : 'none';
    }

    showNoData() {
        this.noData.style.display = 'flex';
    }

    showError(title, message) {
        this.hideAllContentStates();
        this.errorText.textContent = `${title}: ${message}`;
        this.errorMessage.style.display = 'flex';
    }

    async tryMultipleApiFormats(collectionName, collectionId) {
        // Based on the OpenAPI specification from /docs
        const apiFormats = [
            // Format 1: Correct API format based on OpenAPI spec
            {
                method: 'POST',
                body: {
                    include: ["documents", "metadatas", "embeddings"],
                    limit: 1000
                }
            },
            // Format 2: Default include values from schema
            {
                method: 'POST',
                body: {
                    include: ["metadatas", "documents"],
                    limit: 1000
                }
            },
            // Format 3: All available include options
            {
                method: 'POST',
                body: {
                    include: ["documents", "embeddings", "metadatas", "distances", "uris", "data"],
                    limit: 100
                }
            },
            // Format 4: Without limit (rely on defaults)
            {
                method: 'POST',
                body: {
                    include: ["documents", "metadatas", "embeddings"]
                }
            },
            // Format 5: Minimal request with default include
            {
                method: 'POST',
                body: {
                    limit: 1000
                }
            },
            // Format 6: Empty body (should use all defaults)
            {
                method: 'POST',
                body: {}
            }
        ];

        for (let i = 0; i < apiFormats.length; i++) {
            const format = apiFormats[i];

            try {
                const options = {
                    method: format.method,
                    headers: {
                        'Content-Type': 'application/json',
                    }
                };

                if (format.body !== null) {
                    options.body = JSON.stringify(format.body);
                }

                const requestUrl = `${this.baseUrl}/api/v1/collections/${collectionId}/get`;
                const response = await fetch(requestUrl, options);

                if (response.ok) {
                    return response;
                } else {
                    // Try next format if this one fails
                    continue;
                }
            } catch (error) {
                // Try next format if this one throws an error
                continue;
            }
        }

        // If all formats failed, return the last response for error handling
        const lastAttempt = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/get`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                include: ["documents", "metadatas", "embeddings"],
                limit: 1000
            })
        });

        return lastAttempt;
    }

    // Configuration Management
    loadConfig() {
        try {
            const saved = localStorage.getItem('chromaExplorerConfig');
            if (saved) {
                return { ...this.defaultConfig, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to load saved config:', error);
        }
        return { ...this.defaultConfig };
    }

    saveConfigToStorage() {
        try {
            localStorage.setItem('chromaExplorerConfig', JSON.stringify(this.config));
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    }

    buildBaseUrl() {
        const { protocol, host, port, basePath } = this.config;
        const base = `${protocol}://${host}:${port}`;
        return basePath ? `${base}${basePath}` : base;
    }

    initializeConfigForm() {
        this.hostInput.value = this.config.host;
        this.portInput.value = this.config.port;
        this.protocolSelect.value = this.config.protocol;
        this.basePath.value = this.config.basePath;
        this.updateUrlPreview();
    }

    updateUrlPreview() {
        const protocol = this.protocolSelect.value;
        const host = this.hostInput.value || 'localhost';
        const port = this.portInput.value || '8003';
        const basePath = this.basePath.value;

        const baseUrl = `${protocol}://${host}:${port}`;
        const fullUrl = basePath ? `${baseUrl}${basePath}` : baseUrl;

        this.urlPreview.textContent = fullUrl;
    }

    openConfigModal() {
        this.configModal.style.display = 'flex';
        this.initializeConfigForm();
    }

    closeConfigModal() {
        this.configModal.style.display = 'none';
        this.clearTestStatus();
    }

    resetConfig() {
        this.config = { ...this.defaultConfig };
        this.initializeConfigForm();
        this.clearTestStatus();
    }

    async testConfigConnection() {
        const testBtn = this.testConnectionBtn;
        const originalText = testBtn.innerHTML;

        // Update button state
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';

        // Remove any previous test status
        this.clearTestStatus();

        try {
            // Get current form values
            const testConfig = {
                protocol: this.protocolSelect.value,
                host: this.hostInput.value || 'localhost',
                port: parseInt(this.portInput.value) || 8003,
                basePath: this.basePath.value
            };

            const testUrl = this.buildTestUrl(testConfig);

            // Show testing status
            this.showTestStatus('testing', 'Testing connection...');

            const response = await fetch(`${testUrl}/api/v1/heartbeat`, {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                this.showTestStatus('success', 'Connection successful!');
            } else {
                this.showTestStatus('error', `Connection failed: HTTP ${response.status}`);
            }
        } catch (error) {
            this.showTestStatus('error', `Connection failed: ${error.message}`);
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = originalText;
        }
    }

    buildTestUrl(config) {
        const { protocol, host, port, basePath } = config;
        const base = `${protocol}://${host}:${port}`;
        return basePath ? `${base}${basePath}` : base;
    }

    showTestStatus(type, message) {
        this.clearTestStatus();

        const statusDiv = document.createElement('div');
        statusDiv.className = `test-status ${type}`;
        statusDiv.id = 'testStatus';

        const icon = type === 'success' ? 'check-circle' :
            type === 'error' ? 'exclamation-circle' : 'clock';

        statusDiv.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;

        this.urlPreview.parentNode.appendChild(statusDiv);
    }

    clearTestStatus() {
        const existing = document.getElementById('testStatus');
        if (existing) {
            existing.remove();
        }
    }

    async saveConfig() {
        // Validate inputs
        const host = this.hostInput.value.trim();
        const port = parseInt(this.portInput.value);

        if (!host) {
            this.showTestStatus('error', 'Host is required');
            return;
        }

        if (!port || port < 1 || port > 65535) {
            this.showTestStatus('error', 'Valid port number is required (1-65535)');
            return;
        }

        // Update configuration
        this.config = {
            protocol: this.protocolSelect.value,
            host: host,
            port: port,
            basePath: this.basePath.value.trim()
        };

        // Update base URL
        this.baseUrl = this.buildBaseUrl();

        // Save to localStorage
        this.saveConfigToStorage();

        // Close modal
        this.closeConfigModal();

        // Reconnect with new settings
        this.updateConnectionStatus('connecting');
        await this.testConnection();
        await this.loadCollections();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chromaExplorer = new ChromaExplorer();
});

// Handle connection errors globally
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Export for debugging
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChromaExplorer;
}
