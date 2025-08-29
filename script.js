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

        // Pagination state
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.totalPages = 1;
        this.totalCollectionItems = null;
        this.collectionMetadata = null;

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
        this.collectionInfoInline = document.getElementById('collectionInfoInline');
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

        // Pagination elements
        this.paginationControls = document.getElementById('paginationControls');
        this.pageInfo = document.getElementById('pageInfo');
        this.itemsInfo = document.getElementById('itemsInfo');
        this.firstPageBtn = document.getElementById('firstPageBtn');
        this.prevPageBtn = document.getElementById('prevPageBtn');
        this.nextPageBtn = document.getElementById('nextPageBtn');
        this.lastPageBtn = document.getElementById('lastPageBtn');
        this.pageNumbers = document.getElementById('pageNumbers');
        this.itemsPerPageSelect = document.getElementById('itemsPerPage');

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

        // Pagination event listeners
        this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
        this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        this.lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));
        this.itemsPerPageSelect.addEventListener('change', (e) => this.changeItemsPerPage(parseInt(e.target.value)));

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

    async loadCollectionData(collectionName, collectionId, isInitialLoad = true) {
        try {
            if (!collectionId) {
                throw new Error('Collection ID is required but not provided');
            }

            if (isInitialLoad) {
                // Get the exact count using the count endpoint
                const countResponse = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/count`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (countResponse.ok) {
                    const countResult = await countResponse.json();
                    this.totalCollectionItems = countResult || 0;
                } else {
                    console.warn('Count endpoint failed, will estimate from data');
                    this.totalCollectionItems = null;
                }
            }

            // Calculate pagination parameters for current page
            const offset = (this.currentPage - 1) * this.itemsPerPage;
            const limit = this.itemsPerPage;

            // Get collection info using collection ID (only on initial load)
            let collectionInfo;
            if (isInitialLoad) {
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
                collectionInfo = await collectionResponse.json();
                this.collectionMetadata = collectionInfo; // Store for later use
            } else {
                collectionInfo = this.collectionMetadata;
            }

            // Get paginated collection data using collection ID
            const dataResponse = await this.tryMultipleApiFormats(collectionName, collectionId, limit, offset);

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
            this.processCollectionData(collectionInfo, data, isInitialLoad);

        } catch (error) {
            console.error('Error loading collection data:', error);
            throw error;
        }
    }

    processCollectionData(collectionInfo, data, isInitialLoad = true) {
        this.showDataLoading(false);

        if (isInitialLoad) {
            // Update collection info with the exact count from count endpoint
            this.collectionName.textContent = collectionInfo.name;

            // Use the exact count we got from the count endpoint
            if (this.totalCollectionItems !== null) {
                this.documentCount.textContent = this.totalCollectionItems.toLocaleString();
            } else {
                // Fallback to estimating from first page if count endpoint failed
                this.totalCollectionItems = data.ids ? data.ids.length : 0;
                this.documentCount.textContent = this.totalCollectionItems + '+';
            }
        }

        if (!data.ids || data.ids.length === 0) {
            if (isInitialLoad) {
                this.showNoData();
                return;
            } else {
                // No more data on this page, might have reached the end
                this.currentData = [];
                this.filteredData = [];
                this.renderData();
                return;
            }
        }

        // Process data into table format - now this is the current page data
        this.currentData = this.formatDataForDisplay(data);
        this.filteredData = [...this.currentData]; // For server-side, current page is filtered data

        if (isInitialLoad) {
            this.currentPage = 1; // Reset to first page only on initial load
        }

        this.updateServerSidePagination(data.ids.length);
        this.renderData();
        this.dataTableContainer.style.display = 'block';
        this.paginationControls.style.display = 'flex';
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
        // Get paginated data
        const paginatedData = this.getPaginatedData();

        if (this.currentView === 'table') {
            this.renderTableView(paginatedData);
            this.dataTable.style.display = 'block';
            this.dataJson.style.display = 'none';
        } else {
            this.renderJsonView(paginatedData);
            this.dataTable.style.display = 'none';
            this.dataJson.style.display = 'block';
        }
    }

    renderTableView(paginatedData) {
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

        paginatedData.forEach(row => {
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
                const embeddingDiv = document.createElement('div');
                embeddingDiv.className = 'embedding-cell';

                // Add dimension info header
                const headerDiv = document.createElement('div');
                headerDiv.className = 'embedding-header';
                headerDiv.textContent = `Vector (${row.embedding.length} dimensions)`;
                embeddingDiv.appendChild(headerDiv);

                // Add the embedding array
                const arrayDiv = document.createElement('div');
                arrayDiv.className = 'embedding-array';
                arrayDiv.textContent = JSON.stringify(row.embedding, null, 2);
                embeddingDiv.appendChild(arrayDiv);

                embContent.appendChild(embeddingDiv);
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

    renderJsonView(paginatedData) {
        const jsonContainer = document.createElement('div');
        jsonContainer.className = 'json-container';

        // Create a simplified version without large embedding arrays for initial display
        const simplifiedData = paginatedData.map(item => {
            const simplified = { ...item };
            if (simplified.embedding && simplified.embedding.length > 10) {
                simplified.embedding = {
                    dimensions: simplified.embedding.length,
                    preview: simplified.embedding.slice(0, 5),
                    note: `... ${simplified.embedding.length - 5} more values`
                };
            }
            return simplified;
        });

        try {
            // Show loading state
            this.dataJson.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><span>Rendering JSON...</span></div>';

            // Use requestAnimationFrame to prevent UI blocking
            requestAnimationFrame(() => {
                try {
                    // Format JSON with custom replacer to handle long lines
                    const jsonString = JSON.stringify(simplifiedData, null, 2);
                    jsonContainer.textContent = jsonString;

                    // Add info about pagination and truncation
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'json-info';
                    const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
                    const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredData.length);
                    infoDiv.innerHTML = `
                        <p><strong>Page ${this.currentPage} of ${this.totalPages}</strong> - Showing items ${startItem}-${endItem} of ${this.filteredData.length}</p>
                        <p>Embeddings are truncated to first 5 values for performance.</p>
                    `;
                    this.dataJson.innerHTML = '';
                    this.dataJson.appendChild(infoDiv);
                    this.dataJson.appendChild(jsonContainer);
                } catch (innerError) {
                    console.error('Error rendering JSON:', innerError);
                    jsonContainer.textContent = 'Error: Unable to render JSON view due to data size or complexity.';
                    this.dataJson.innerHTML = '';
                    this.dataJson.appendChild(jsonContainer);
                }
            });
        } catch (error) {
            console.error('Error preparing JSON:', error);
            jsonContainer.textContent = 'Error: Unable to render JSON view due to data size or complexity.';
            this.dataJson.innerHTML = '';
            this.dataJson.appendChild(jsonContainer);
        }
    }

    filterData(searchTerm) {
        if (!searchTerm.trim()) {
            // Clear search - reload from server
            this.searchInput.value = '';
            this.goToPage(1);
        } else {
            // For now, implement client-side search on current page only
            // TODO: Implement server-side search with ChromaDB where/where_document
            const term = searchTerm.toLowerCase();
            this.filteredData = this.currentData.filter(row => {
                return (
                    row.id.toLowerCase().includes(term) ||
                    (row.document && row.document.toLowerCase().includes(term)) ||
                    (row.metadata && JSON.stringify(row.metadata).toLowerCase().includes(term))
                );
            });

            // For search, use client-side pagination
            this.updatePagination();
            this.renderData();

            // Show a note that search is limited to current page
            if (this.filteredData.length < this.currentData.length) {
                console.info('Search is limited to current page. Server-side search coming soon.');
            }
        }
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

    // Pagination Methods
    getPaginatedData() {
        // For server-side pagination, we already have the paginated data
        return this.filteredData;
    }

    updateServerSidePagination(currentPageItemCount) {
        // If we have the exact count from the count endpoint, calculate exact pages
        if (this.totalCollectionItems !== null) {
            this.totalPages = Math.ceil(this.totalCollectionItems / this.itemsPerPage);
        } else {
            // Fallback: Estimate total pages based on current page
            if (currentPageItemCount === this.itemsPerPage) {
                // We got a full page, so there might be more
                this.totalPages = this.currentPage + 1; // At least one more page
            } else {
                // We got less than a full page, so this is likely the last page
                this.totalPages = this.currentPage;
            }

            // Update the total collection items estimate
            const estimatedTotal = (this.currentPage - 1) * this.itemsPerPage + currentPageItemCount;
            if (currentPageItemCount < this.itemsPerPage) {
                // This is the last page, so we know the exact total
                this.totalCollectionItems = estimatedTotal;
                this.documentCount.textContent = this.totalCollectionItems.toLocaleString();
            }
        }

        this.updatePaginationUI();
    }

    updatePagination() {
        // For client-side pagination (search results)
        this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        this.updatePaginationUI();
    }

    updatePaginationUI() {
        // Update page info
        const pageInfo = this.totalCollectionItems !== null
            ? `Page ${this.currentPage} of ${this.totalPages}`
            : `Page ${this.currentPage} of ${this.totalPages}+`;
        this.pageInfo.textContent = pageInfo;

        // Update items info
        const startItem = this.filteredData.length > 0 ? (this.currentPage - 1) * this.itemsPerPage + 1 : 0;
        const endItem = startItem + this.filteredData.length - 1;

        let itemsInfo;
        if (this.totalCollectionItems !== null) {
            itemsInfo = `Showing ${startItem.toLocaleString()}-${endItem.toLocaleString()} of ${this.totalCollectionItems.toLocaleString()} items`;
        } else {
            const estimatedTotal = this.totalCollectionItems || this.filteredData.length;
            itemsInfo = `Showing ${startItem.toLocaleString()}-${endItem.toLocaleString()} of ${estimatedTotal.toLocaleString()}+ items`;
        }
        this.itemsInfo.textContent = itemsInfo;

        // Update button states
        this.firstPageBtn.disabled = this.currentPage === 1;
        this.prevPageBtn.disabled = this.currentPage === 1;

        // For next/last buttons, be more careful if we have exact count
        if (this.totalCollectionItems !== null) {
            this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
            this.lastPageBtn.disabled = this.currentPage >= this.totalPages;
        } else {
            // If we don't have exact count, disable only if current page has no data
            this.nextPageBtn.disabled = this.filteredData.length === 0;
            this.lastPageBtn.disabled = this.filteredData.length === 0;
        }

        // Update page numbers
        this.renderPageNumbers();
    }

    renderPageNumbers() {
        this.pageNumbers.innerHTML = '';

        const maxPageButtons = 5;
        const halfRange = Math.floor(maxPageButtons / 2);

        let startPage = Math.max(1, this.currentPage - halfRange);
        let endPage = Math.min(this.totalPages, startPage + maxPageButtons - 1);

        // Adjust start if we're near the end
        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        // Add first page and ellipsis if needed
        if (startPage > 1) {
            this.createPageButton(1);
            if (startPage > 2) {
                this.createEllipsis();
            }
        }

        // Add page numbers
        for (let i = startPage; i <= endPage; i++) {
            this.createPageButton(i);
        }

        // Add last page and ellipsis if needed
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                this.createEllipsis();
            }
            this.createPageButton(this.totalPages);
        }
    }

    createPageButton(pageNumber) {
        const button = document.createElement('button');
        button.className = 'page-number';
        button.textContent = pageNumber;
        button.addEventListener('click', () => this.goToPage(pageNumber));

        if (pageNumber === this.currentPage) {
            button.classList.add('active');
        }

        this.pageNumbers.appendChild(button);
    }

    createEllipsis() {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'page-ellipsis';
        ellipsis.textContent = '...';
        this.pageNumbers.appendChild(ellipsis);
    }

    async goToPage(pageNumber) {
        if (pageNumber >= 1 && pageNumber !== this.currentPage) {
            // Don't go beyond known total pages (if we have exact count)
            if (this.totalCollectionItems !== null && pageNumber > this.totalPages) {
                return; // Don't go beyond the last page
            }

            this.currentPage = pageNumber;
            this.showDataLoading(true);

            try {
                // Load data for the new page from server
                await this.loadCollectionData(this.currentCollection, this.currentCollectionId, false);
            } catch (error) {
                console.error('Error loading page data:', error);
                this.showError('Failed to load page data', error.message);
            }
        }
    }

    async changeItemsPerPage(newItemsPerPage) {
        this.itemsPerPage = newItemsPerPage;
        this.currentPage = 1; // Reset to first page
        this.showDataLoading(true);

        try {
            // Reload data with new page size
            await this.loadCollectionData(this.currentCollection, this.currentCollectionId, false);
        } catch (error) {
            console.error('Error changing page size:', error);
            this.showError('Failed to change page size', error.message);
        }
    }

    // UI State Management
    hideAllContentStates() {
        this.welcomeMessage.style.display = 'none';
        this.dataLoading.style.display = 'none';
        this.dataTableContainer.style.display = 'none';
        this.noData.style.display = 'none';
        this.errorMessage.style.display = 'none';
        this.paginationControls.style.display = 'none';
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

    async tryMultipleApiFormats(collectionName, collectionId, limit = null, offset = null) {
        // Calculate pagination parameters
        const paginationParams = {};
        if (limit !== null) paginationParams.limit = limit;
        if (offset !== null) paginationParams.offset = offset;

        // Based on the OpenAPI specification from /docs
        const apiFormats = [
            // Format 1: Correct API format based on OpenAPI spec with pagination
            {
                method: 'POST',
                body: {
                    include: ["documents", "metadatas", "embeddings"],
                    ...paginationParams
                }
            },
            // Format 2: Default include values from schema with pagination
            {
                method: 'POST',
                body: {
                    include: ["metadatas", "documents"],
                    ...paginationParams
                }
            },
            // Format 3: All available include options with pagination
            {
                method: 'POST',
                body: {
                    include: ["documents", "embeddings", "metadatas", "distances", "uris", "data"],
                    ...paginationParams
                }
            },
            // Format 4: Without explicit include, only pagination
            {
                method: 'POST',
                body: {
                    include: ["documents", "metadatas", "embeddings"],
                    ...paginationParams
                }
            },
            // Format 5: Minimal request with pagination
            {
                method: 'POST',
                body: {
                    ...paginationParams
                }
            },
            // Format 6: Empty body (fallback)
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
