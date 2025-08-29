// ChromaDB Viewer - Fixed Version with Proper Pagination and Counts
class ChromaDBViewer {
    constructor() {
        this.apiVersion = 'v1';
        this.config = this.loadConfig();
        this.baseUrl = this.buildBaseUrl();
        this.collections = [];
        this.currentCollection = null;
        this.currentPage = 1;
        this.pageSize = 25;
        this.totalDocuments = 0;

        this.init();
    }

    // Configuration Management
    getDefaultConfig() {
        return {
            host: 'localhost',
            port: 5001,
            protocol: 'http',
            path: '/api/v1',
            timeout: 5000
        };
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('chromadb-config');
            return saved ? { ...this.getDefaultConfig(), ...JSON.parse(saved) } : this.getDefaultConfig();
        } catch (error) {
            console.warn('Failed to load config from localStorage:', error);
            return this.getDefaultConfig();
        }
    }

    saveConfig(config) {
        try {
            localStorage.setItem('chromadb-config', JSON.stringify(config));
            this.config = { ...this.getDefaultConfig(), ...config };
            this.baseUrl = this.buildBaseUrl();
            return true;
        } catch (error) {
            console.error('Failed to save config:', error);
            return false;
        }
    }

    buildBaseUrl() {
        const url = `${this.config.protocol}://${this.config.host}:${this.config.port}${this.config.path}`;
        console.log('Built base URL:', url);
        return url;
    }

    // Configuration UI
    showConfigModal() {
        const modal = document.getElementById('config-modal');

        // Populate form with current config
        document.getElementById('db-host').value = this.config.host;
        document.getElementById('db-port').value = this.config.port;
        document.getElementById('db-protocol').value = this.config.protocol;
        document.getElementById('db-path').value = this.config.path;
        document.getElementById('connection-timeout').value = this.config.timeout;

        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    hideConfigModal() {
        const modal = document.getElementById('config-modal');
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    async testConnection(config = null) {
        const testConfig = config || this.getFormConfig();
        const testUrl = `${testConfig.protocol}://${testConfig.host}:${testConfig.port}${testConfig.path}`;
        console.log('Testing connection to:', testUrl);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), testConfig.timeout);

            console.log('Making fetch request to:', `${testUrl}/heartbeat`);
            const response = await fetch(`${testUrl}/heartbeat`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });

            clearTimeout(timeoutId);
            console.log('Response status:', response.status, response.statusText);

            if (response.ok) {
                this.showNotification('Connection successful!', 'success');
                return true;
            } else {
                this.showNotification(`Connection failed: ${response.status} ${response.statusText}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('Connection test error:', error);
            if (error.name === 'AbortError') {
                this.showNotification('Connection timeout', 'error');
            } else {
                this.showNotification(`Connection failed: ${error.message}`, 'error');
            }
            return false;
        }
    }

    async testConnectionSilent(config = null) {
        const testConfig = config || this.getFormConfig();
        const testUrl = `${testConfig.protocol}://${testConfig.host}:${testConfig.port}${testConfig.path}`;
        console.log('Testing connection silently to:', testUrl);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), testConfig.timeout);

            const response = await fetch(`${testUrl}/heartbeat`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });

            clearTimeout(timeoutId);
            console.log('Silent test response:', response.status, response.statusText);

            return response.ok;
        } catch (error) {
            console.error('Silent connection test error:', error);
            return false;
        }
    }

    getFormConfig() {
        return {
            host: document.getElementById('db-host').value.trim() || 'localhost',
            port: parseInt(document.getElementById('db-port').value) || 5001,
            protocol: document.getElementById('db-protocol').value || 'http',
            path: document.getElementById('db-path').value.trim() || '/api/v1',
            timeout: parseInt(document.getElementById('connection-timeout').value) || 5000
        };
    }

    async saveAndConnect() {
        console.log('=== Starting saveAndConnect ===');

        try {
            const newConfig = this.getFormConfig();
            console.log('New config:', newConfig);

            // Validate configuration
            if (!newConfig.host) {
                this.showNotification('Host is required', 'error');
                return;
            }

            if (newConfig.port < 1 || newConfig.port > 65535) {
                this.showNotification('Port must be between 1 and 65535', 'error');
                return;
            }

            if (newConfig.timeout < 1000 || newConfig.timeout > 30000) {
                this.showNotification('Timeout must be between 1000 and 30000ms', 'error');
                return;
            }

            // Show loading state
            this.showLoading(true);

            // Test connection first (silently)
            console.log('Testing connection...');
            const connectionWorking = await this.testConnectionSilent(newConfig);
            console.log('Connection test result:', connectionWorking);

            if (connectionWorking) {
                console.log('Saving configuration...');
                // Save config and reconnect
                if (this.saveConfig(newConfig)) {
                    console.log('Configuration saved, proceeding with reconnection...');
                    this.showNotification('Configuration saved successfully!', 'success');
                    this.hideConfigModal();

                    // Clear current state
                    console.log('Clearing current data...');
                    this.clearCurrentData();

                    // Reconnect with new settings
                    console.log('Checking connection with new config...');
                    await this.checkConnection();

                    console.log('Loading collections with new config...');
                    await this.loadCollections();

                    this.showNotification('Successfully connected to new database!', 'success');
                    console.log('=== saveAndConnect completed successfully ===');
                } else {
                    this.showNotification('Failed to save configuration', 'error');
                }
            } else {
                this.showNotification('Connection test failed. Please check your settings.', 'error');
            }
        } catch (error) {
            console.error('Error in saveAndConnect:', error);
            this.showNotification('Error updating configuration: ' + error.message, 'error');
        } finally {
            // Always hide loading state
            this.showLoading(false);
        }
    }

    clearCurrentData() {
        console.log('=== Clearing current data ===');
        // Reset current state
        this.collections = [];
        this.currentCollection = null;
        this.documents = [];
        this.totalDocuments = 0;
        this.currentPage = 1;

        // Clear collections list
        const collectionsContainer = document.getElementById('collections-list');
        if (collectionsContainer) {
            collectionsContainer.innerHTML = '<div class="loading">Loading collections...</div>';
        } else {
            console.warn('collections-list element not found');
        }

        // Clear collection name and hide collection view
        const collectionNameElement = document.getElementById('collection-name');
        if (collectionNameElement) {
            collectionNameElement.textContent = '';
        } else {
            console.warn('collection-name element not found');
        }

        // Clear documents table
        const tableBody = document.getElementById('table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data">Select a collection to view documents</td></tr>';
        } else {
            console.warn('table-body element not found');
        }

        // Reset pagination
        this.updatePagination();

        // Show default view instead of collection view
        this.showView('default-view');

        // Remove active states from collection items
        document.querySelectorAll('.collection-item').forEach(item => {
            item.classList.remove('active');
        });

        // Clear search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
        } else {
            console.warn('search-input element not found');
        }

        // Reset page size to default
        const pageSizeSelect = document.getElementById('page-size');
        if (pageSizeSelect) {
            pageSizeSelect.value = '25';
            this.pageSize = 25;
        } else {
            console.warn('page-size element not found');
        }

        console.log('Cleared current data for new connection');
    }

    async init() {
        console.log('Initializing ChromaDB Viewer...');
        this.showLoading(true);

        try {
            await this.checkConnection();
            await this.loadCollections();
            this.setupEventListeners();
            this.showNotification('Connected successfully!', 'success');
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showNotification('Failed to connect to ChromaDB', 'error');
        }

        this.showLoading(false);
    }

    async checkConnection() {
        console.log('Checking connection to:', this.baseUrl);
        try {
            const response = await fetch(`${this.baseUrl}/heartbeat`);
            console.log('Connection check response:', response.status, response.statusText);
            if (response.ok) {
                document.getElementById('connection-status').textContent = 'Connected';
                document.getElementById('connection-status').className = 'status-online';
                return true;
            }
        } catch (error) {
            console.error('Connection failed:', error);
        }

        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').className = 'status-offline';
        throw new Error('Cannot connect to ChromaDB');
    }

    async loadCollections() {
        try {
            console.log('Loading collections...');
            const response = await fetch(`${this.baseUrl}/collections`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const collections = await response.json();
            console.log('Collections loaded:', collections);

            // Load counts for each collection
            this.collections = await this.loadCollectionCounts(collections);
            this.renderCollections();
        } catch (error) {
            console.error('Failed to load collections:', error);
            throw error;
        }
    }

    async loadCollectionCounts(collections) {
        console.log('Loading collection counts...');
        const collectionsWithCounts = [];

        for (const collection of collections) {
            try {
                console.log(`Getting count for collection: ${collection.name} (${collection.id})`);
                const countResponse = await fetch(`${this.baseUrl}/collections/${collection.id}/count`);

                if (countResponse.ok) {
                    const count = await countResponse.text();
                    collection.documentCount = parseInt(count) || 0;
                } else {
                    console.warn(`Failed to get count for ${collection.name}`);
                    collection.documentCount = 0;
                }
            } catch (error) {
                console.warn(`Error getting count for ${collection.name}:`, error);
                collection.documentCount = 0;
            }

            collectionsWithCounts.push(collection);
        }

        console.log('Collections with counts:', collectionsWithCounts);
        return collectionsWithCounts;
    }

    renderCollections() {
        const container = document.getElementById('collections-list');

        if (!this.collections || this.collections.length === 0) {
            container.innerHTML = '<div class="loading">No collections found</div>';
            return;
        }

        const html = this.collections.map(collection => `
            <div class="collection-item" onclick="viewer.selectCollection('${collection.name}', '${collection.id}')">
                <span class="collection-name">${collection.name}</span>
                <span class="collection-count">${collection.documentCount || 0} docs</span>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async selectCollection(collectionName, collectionId) {
        console.log('Selecting collection:', collectionName, 'ID:', collectionId);

        try {
            this.currentCollection = { name: collectionName, id: collectionId };
            this.currentPage = 1;

            // Update UI
            document.querySelectorAll('.collection-item').forEach(item => {
                item.classList.remove('active');
            });

            // Find and activate the clicked collection
            const clickedItem = event.target.closest('.collection-item');
            if (clickedItem) {
                clickedItem.classList.add('active');
            }

            document.getElementById('collection-name').textContent = collectionName;

            // Show collection view
            this.showView('collection-view');

            // Load documents
            await this.loadDocuments();

        } catch (error) {
            console.error('Failed to select collection:', error);
            this.showNotification('Failed to load collection', 'error');
        }
    }

    async loadDocuments() {
        if (!this.currentCollection) return;

        this.showLoading(true);

        try {
            console.log(`Loading documents for collection: ${this.currentCollection.name}`);

            // Get the accurate count first
            await this.getCollectionCount();

            // Calculate offset
            const offset = (this.currentPage - 1) * this.pageSize;

            // Get documents
            const requestBody = {
                limit: this.pageSize,
                offset: offset,
                include: ['documents', 'metadatas', 'embeddings']
            };

            console.log('Request body:', requestBody);

            const response = await fetch(`${this.baseUrl}/collections/${this.currentCollection.id}/get`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Documents loaded:', data);

            this.renderDocuments(data);
            this.updatePagination();

        } catch (error) {
            console.error('Failed to load documents:', error);
            this.showNotification('Failed to load documents: ' + error.message, 'error');
        }

        this.showLoading(false);
    }

    async getCollectionCount() {
        try {
            console.log('Getting collection count for ID:', this.currentCollection.id);

            const response = await fetch(`${this.baseUrl}/collections/${this.currentCollection.id}/count`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const countText = await response.text();
            this.totalDocuments = parseInt(countText) || 0;
            console.log('Total documents count:', this.totalDocuments);

        } catch (error) {
            console.warn('Failed to get count, using cached count:', error);
            // Fallback to cached collection count
            const collection = this.collections.find(c => c.id === this.currentCollection.id);
            this.totalDocuments = collection ? (collection.documentCount || 0) : 0;
        }
    }

    renderDocuments(data) {
        const tbody = document.getElementById('table-body');

        if (!data.ids || data.ids.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No documents found in this collection</td></tr>';
            return;
        }

        const rows = data.ids.map((id, index) => {
            const document = data.documents ? data.documents[index] || '' : '';
            const metadata = data.metadatas ? data.metadatas[index] || {} : {};
            const embedding = data.embeddings ? data.embeddings[index] : null;

            const metadataStr = JSON.stringify(metadata);
            const embeddingInfo = embedding ? `${embedding.length}D vector` : 'No embedding';

            // Truncate long content for display
            const truncatedDoc = document.length > 200 ? document.substring(0, 200) + '...' : document;
            const truncatedMeta = metadataStr.length > 100 ? metadataStr.substring(0, 100) + '...' : metadataStr;

            return `
                <tr>
                    <td title="${id}">${id}</td>
                    <td title="${document}">${truncatedDoc || '<em>No content</em>'}</td>
                    <td title="${metadataStr}">${truncatedMeta}</td>
                    <td>${embeddingInfo}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn" onclick="viewer.viewDocument('${id}')" title="View">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="action-btn" onclick="viewer.editDocument('${id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn danger" onclick="viewer.deleteDocument('${id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    }

    updatePagination() {
        const totalPages = Math.max(1, Math.ceil(this.totalDocuments / this.pageSize));
        const startItem = this.totalDocuments > 0 ? ((this.currentPage - 1) * this.pageSize) + 1 : 0;
        const endItem = Math.min(this.currentPage * this.pageSize, this.totalDocuments);

        // Update pagination text
        if (this.totalDocuments === 0) {
            document.getElementById('pagination-text').textContent = 'No documents found';
        } else {
            document.getElementById('pagination-text').textContent =
                `Showing ${startItem} to ${endItem} of ${this.totalDocuments} documents`;
        }

        // Update button states
        const firstBtn = document.getElementById('first-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const lastBtn = document.getElementById('last-btn');

        const isFirstPage = this.currentPage <= 1;
        const isLastPage = this.currentPage >= totalPages;
        const hasData = this.totalDocuments > 0;

        firstBtn.disabled = isFirstPage || !hasData;
        prevBtn.disabled = isFirstPage || !hasData;
        nextBtn.disabled = isLastPage || !hasData;
        lastBtn.disabled = isLastPage || !hasData;

        // Generate page numbers
        this.generatePageNumbers(totalPages);

        // Ensure current page is within bounds
        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = totalPages;
            this.loadDocuments();
        }
    }

    generatePageNumbers(totalPages) {
        const pageNumbersContainer = document.getElementById('page-numbers');
        const maxVisiblePages = 7; // Show max 7 page numbers

        if (totalPages <= 1) {
            pageNumbersContainer.innerHTML = '';
            return;
        }

        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        // Adjust if we're near the end
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        let pageNumbers = [];

        // Add first page if not in range
        if (startPage > 1) {
            pageNumbers.push(this.createPageButton(1));
            if (startPage > 2) {
                pageNumbers.push(this.createEllipsis());
            }
        }

        // Add page range
        for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(this.createPageButton(i));
        }

        // Add last page if not in range
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pageNumbers.push(this.createEllipsis());
            }
            pageNumbers.push(this.createPageButton(totalPages));
        }

        pageNumbersContainer.innerHTML = pageNumbers.join('');
    }

    createPageButton(pageNum) {
        const isActive = pageNum === this.currentPage;
        const activeClass = isActive ? ' active' : '';

        return `
            <button class="page-number${activeClass}" onclick="viewer.goToPage(${pageNum})">
                ${pageNum}
            </button>
        `;
    }

    createEllipsis() {
        return '<span class="page-number ellipsis">...</span>';
    }

    goToPage(pageNum) {
        if (pageNum !== this.currentPage && pageNum >= 1) {
            this.currentPage = pageNum;
            this.loadDocuments();
        }
    }



    setupEventListeners() {
        // Page size change
        document.getElementById('page-size').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            if (this.currentCollection) {
                this.loadDocuments();
            }
        });

        // Enhanced pagination controls
        document.getElementById('first-btn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage = 1;
                this.loadDocuments();
            }
        });

        document.getElementById('prev-btn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadDocuments();
            }
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalDocuments / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.loadDocuments();
            }
        });

        document.getElementById('last-btn').addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalDocuments / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage = totalPages;
                this.loadDocuments();
            }
        });

        // Search (simple implementation)
        let searchTimeout;
        document.getElementById('search-input').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                // For now, just reload - could implement search later
                if (this.currentCollection) {
                    this.loadDocuments();
                }
            }, 500);
        });

        // Configuration modal event listeners
        document.getElementById('config-btn').addEventListener('click', () => {
            this.showConfigModal();
        });

        document.getElementById('config-close').addEventListener('click', () => {
            this.hideConfigModal();
        });

        // Close modal when clicking outside
        document.getElementById('config-modal').addEventListener('click', (e) => {
            if (e.target.id === 'config-modal') {
                this.hideConfigModal();
            }
        });

        document.getElementById('test-connection').addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Test connection button clicked');
            await this.testConnection();
        });

        document.getElementById('config-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Form submitted');
            await this.saveAndConnect();
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('config-modal');
                if (modal.classList.contains('show')) {
                    this.hideConfigModal();
                }
            }
        });
    }

    showView(viewId) {
        // Remove active class from all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Add active class to target view if it exists
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
        } else {
            console.warn(`View with ID '${viewId}' not found`);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.add('show');
        } else {
            loading.classList.remove('show');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // Action methods (placeholders)
    viewDocument(id) {
        this.showNotification(`View document: ${id}`, 'info');
    }

    editDocument(id) {
        this.showNotification(`Edit document: ${id}`, 'info');
    }

    deleteDocument(id) {
        if (confirm(`Are you sure you want to delete document ${id}?`)) {
            this.showNotification(`Delete document: ${id}`, 'info');
        }
    }

    // Refresh current collection
    async refreshCollection() {
        if (this.currentCollection) {
            this.currentPage = 1;
            await this.loadDocuments();
            this.showNotification('Collection refreshed', 'success');
        }
    }

    // Refresh all collections and their counts
    async refreshAllCollections() {
        this.showLoading(true);
        try {
            await this.loadCollections();
            this.showNotification('All collections refreshed', 'success');
        } catch (error) {
            this.showNotification('Failed to refresh collections', 'error');
        }
        this.showLoading(false);
    }
}

// Global functions
function createCollection() {
    viewer.showNotification('Create collection feature coming soon', 'info');
}

function addDocument() {
    viewer.showNotification('Add document feature coming soon', 'info');
}

function refreshCollection() {
    viewer.refreshCollection();
}

// Initialize when page loads
let viewer;
document.addEventListener('DOMContentLoaded', () => {
    viewer = new ChromaDBViewer();
});