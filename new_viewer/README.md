# ChromaDB Database Visualizer

A comprehensive Single Page Application (SPA) for visualizing and managing ChromaDB databases. This tool provides an interactive interface to browse collections, view documents, search embeddings, and manage your ChromaDB data with support for both API v1 and v2.

## Features

### 🎯 Database Visualization
- **Real-time Dashboard**: Overview of collections, documents, and database health
- **Interactive Collection Browser**: Hierarchical view of tenants, databases, and collections
- **Document Explorer**: View and manage documents with their embeddings and metadata
- **Activity Monitoring**: Track database operations and changes

### 🔍 Advanced Search & Query
- **Similarity Search**: Find similar documents using vector embeddings
- **Metadata Filtering**: Search by document metadata fields
- **Document Content Search**: Filter by document text content
- **Combined Search**: Use multiple search criteria simultaneously

### 📊 Data Management
- **Collection Management**: Create, view, and manage collections
- **Document CRUD**: Add, view, update, and delete documents
- **Bulk Operations**: Handle multiple documents efficiently
- **Metadata Visualization**: View and edit document metadata

### 🔄 API Version Support
- **API v1**: Simple flat structure with query parameters
- **API v2**: Hierarchical tenant/database/collection structure
- **Seamless Switching**: Toggle between API versions dynamically
- **Version-Specific Features**: Different workflows for each API version

## Architecture

### Key Differences Between v1 and v2

#### API v1 Structure:
```
/api/v1/collections
/api/v1/collections/{collection_id}/add
/api/v1/collections/{collection_id}/query
```
- Collections accessed directly
- Tenant/database specified as query parameters
- Simpler URL structure

#### API v2 Structure:
```
/api/v2/tenants/{tenant}/databases/{database}/collections
/api/v2/tenants/{tenant}/databases/{database}/collections/{collection_id}/add
/api/v2/tenants/{tenant}/databases/{database}/collections/{collection_id}/query
```
- Hierarchical resource structure
- Tenant and database in URL path
- Better organization and security

## Installation & Setup

### Prerequisites
- ChromaDB server running on `localhost:5001`
- Python 3.7+ with pip
- Modern web browser

### Quick Start

1. **Navigate to the project directory**
   ```bash
   cd new_viewer
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the visualizer**
   ```bash
   python app.py
   ```

4. **Open in browser**
   ```
   http://localhost:8080
   ```

## Usage Guide

### 1. Dashboard Overview
- View total collections and documents
- Monitor server connection status
- See real-time activity log
- Visual distribution of collection sizes

### 2. Collection Management
- **Browse Collections**: Navigate the database tree on the left sidebar
- **Create Collections**: Use the "New Collection" button
- **View Details**: Click on any collection to see its contents
- **API Version Toggle**: Switch between v1 and v2 APIs

### 3. Document Operations
- **View Documents**: Select a collection to see all documents
- **Add Documents**: Use "Add Document" button for bulk insertion
- **Search Documents**: Use the search bar to filter by content
- **Manage Metadata**: View and edit document metadata

### 4. Advanced Search
- **Similarity Search**: Input query embeddings to find similar documents
- **Filter by Metadata**: Use JSON queries to filter by metadata fields
- **Document Content**: Search within document text
- **Combined Queries**: Use multiple criteria together

### 5. Data Visualization
- **Collection Charts**: Pie chart showing document distribution
- **Activity Timeline**: Recent operations and changes
- **Embedding Visualization**: (Feature in development)

## API Integration

### Direct ChromaDB Communication
The visualizer communicates directly with ChromaDB:

```javascript
// Example: Load collections (v1)
fetch('http://localhost:5001/api/v1/collections')

// Example: Load collections (v2)
fetch('http://localhost:5001/api/v2/tenants/default_tenant/databases/default_database/collections')

// Example: Search documents
fetch('http://localhost:5001/api/v1/collections/{id}/query', {
    method: 'POST',
    body: JSON.stringify({
        query_embeddings: [[0.1, 0.2, 0.3]],
        n_results: 10
    })
})
```

### Supported Operations

#### System Operations
- Health checks (`/heartbeat`)
- Version information (`/version`)
- Database reset (`/reset`)

#### Collection Operations
- List collections
- Create new collections
- Get collection details
- Update collection metadata
- Delete collections

#### Document Operations
- Add documents with embeddings
- Update existing documents
- Query similar documents
- Delete documents
- Get documents with filters

#### Search & Query
- Vector similarity search
- Metadata-based filtering
- Document content search
- Combined multi-criteria queries

## Project Structure

```
new_viewer/
├── app.py              # Flask server (serves static files)
├── index.html          # Main SPA interface
├── script.js           # JavaScript application logic
├── styles.css          # Responsive CSS styling
├── requirements.txt    # Python dependencies
└── README.md          # This documentation
```

## Features in Detail

### 🎨 User Interface
- **Modern Design**: Clean, professional interface
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **Dark/Light Theme**: Automatic theme adaptation
- **Interactive Elements**: Hover effects and smooth transitions

### 🔧 Technical Features
- **Real-time Updates**: Live connection status monitoring
- **Error Handling**: Comprehensive error messages and recovery
- **Performance**: Efficient data loading and caching
- **Accessibility**: Keyboard navigation and screen reader support

### 📱 Mobile Support
- **Responsive Design**: Adapts to all screen sizes
- **Touch-Friendly**: Optimized for touch interactions
- **Offline Indicators**: Clear connection status

## Troubleshooting

### Connection Issues
```bash
# Check ChromaDB server status
curl http://localhost:5001/api/v1/heartbeat

# Verify server is running
ps aux | grep chroma
```

### Common Problems

**Problem**: "ChromaDB server is not accessible"
**Solution**: Ensure ChromaDB is running on port 5001

**Problem**: "Collections not loading"
**Solution**: Check API version compatibility and permissions

**Problem**: "Search not working"
**Solution**: Verify embedding dimensions match collection requirements

### Browser Console
Check browser console (F12) for detailed error messages and debugging information.

## Development

### Adding New Features
1. **Backend**: Modify `app.py` for new server endpoints
2. **Frontend**: Extend `script.js` ChromaDBVisualizer class
3. **Styling**: Update `styles.css` for new UI components

### Testing
- Test with different collection sizes
- Verify both API v1 and v2 compatibility
- Check responsive design on various devices

## Future Enhancements

### Planned Features
- **3D Embedding Visualization**: Plot embeddings in 3D space
- **Clustering Analysis**: Automatic document clustering
- **Export/Import**: Data backup and migration tools
- **Advanced Analytics**: Statistics and insights
- **Authentication**: User management and permissions

### Contributing
The codebase is modular and extensible. Key areas for enhancement:
- Visualization algorithms (Chart.js, Plotly.js)
- Search interface improvements
- Performance optimizations
- Additional ChromaDB features

## License

This project is designed for educational and development purposes. Please refer to ChromaDB's official documentation for production usage guidelines.

## Support

For issues related to:
- **ChromaDB functionality**: Check ChromaDB documentation
- **Visualizer features**: Review browser console and server logs
- **API compatibility**: Verify ChromaDB version and API endpoint availability