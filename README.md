# 🔍 Chroma Database Explorer

A modern, responsive Single Page Application (SPA) for exploring and visualizing data in Chroma vector databases. Built with vanilla HTML, CSS, and JavaScript for maximum compatibility and ease of deployment.

![Chroma Database Explorer](https://img.shields.io/badge/Chroma-Database%20Explorer-blue?style=for-the-badge)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## ✨ Features

### 🎯 Core Functionality
- **Real-time Connection Management** - Monitor and configure database connections
- **Collection Browser** - View all available collections in your Chroma database
- **Data Visualization** - Display collection contents in table or JSON format
- **Search & Filter** - Search through documents and metadata
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- **CORS Proxy Support** - Connect to remote Chroma instances without server modifications

### 🛠 Technical Features
- **No Dependencies** - Pure HTML, CSS, and JavaScript
- **Modern UI** - Clean, professional interface with smooth animations
- **Configurable Connections** - Support for local and remote Chroma servers
- **Multiple API Formats** - Automatically detects and adapts to different Chroma versions
- **Persistent Settings** - Connection preferences saved in localStorage
- **Error Handling** - Comprehensive error reporting and recovery options

## 🚀 Quick Start

### Prerequisites
- A running Chroma database instance
- Modern web browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- Python 3.6+ (for running the included servers)

### Installation

1. **Clone or download the project:**
   ```bash
   git clone <repository-url>
   cd chromadb_viewer
   ```

2. **For local Chroma databases:**
   ```bash
   # Start the local HTTP server
   python3 serve.py
   # Open browser to http://localhost:8080
   ```

3. **For remote Chroma databases:**
   ```bash
   # Start the CORS proxy server
   python3 proxy-server.py --target-host YOUR_HOST --target-port YOUR_PORT --proxy-port 5001
   # Configure the web app to use localhost:5001
   ```

## 📋 Usage Guide

### Connecting to Local Chroma

1. **Start your Chroma database** (usually on port 8000 or 8003)
2. **Launch the HTTP server:**
   ```bash
   python3 serve.py
   ```
3. **Open your browser** to `http://localhost:8080`
4. **Configure connection** (click ⚙️ gear icon):
   - Host: `localhost`
   - Port: `8000` (or your Chroma port)
   - Protocol: `http`

### Connecting to Remote Chroma

1. **Start the proxy server:**
   ```bash
   # For a specific remote server
   python3 proxy-server.py --target-host 192.168.1.100 --target-port 8000 --proxy-port 5001
   
   # Example for the server in your setup
   python3 proxy-server.py --target-host 98.70.241.152 --target-port 8000 --proxy-port 5001
   ```

2. **Configure the web application:**
   - Host: `localhost`
   - Port: `5001` (proxy port)
   - Protocol: `http`

### Exploring Your Data

1. **Browse Collections** - Collections appear in the left sidebar
2. **View Data** - Click any collection to see its contents
3. **Search & Filter** - Use the search box to find specific documents
4. **Switch Views** - Toggle between table and JSON views
5. **Examine Details** - Inspect documents, metadata, and embeddings

## 🏗 Project Structure

```
chromadb_viewer/
├── index.html              # Main application interface
├── styles.css              # Comprehensive styling and responsive design
├── script.js               # Application logic and API integration
├── serve.py                # Local HTTP server for development
├── proxy-server.py         # CORS proxy for remote connections
├── README.md               # This comprehensive documentation
└── DEPLOYMENT.md           # Deployment guide for different environments
```

## ⚙️ Configuration Options

### Connection Settings
- **Host**: Hostname or IP address of your Chroma server
- **Port**: Port number (default: 8000)
- **Protocol**: HTTP or HTTPS
- **Base Path**: Optional path prefix for proxied deployments

### Display Options
- **Table View**: Structured display with sortable columns
- **JSON View**: Raw data format for technical inspection
- **Search**: Filter documents by content or metadata
- **Pagination**: Automatic handling of large datasets

## 🔧 Advanced Configuration

### Custom Proxy Setup

For complex network configurations, you can customize the proxy server:

```bash
python3 proxy-server.py \
  --target-host your-chroma-server.com \
  --target-port 8000 \
  --proxy-port 5001
```

### Environment Variables

Set these environment variables for default configuration:

```bash
export CHROMA_HOST=localhost
export CHROMA_PORT=8000
export CHROMA_PROTOCOL=http
```

### SSL/TLS Support

For HTTPS connections, ensure your Chroma server has proper SSL certificates:

```bash
# Configure for HTTPS
python3 proxy-server.py \
  --target-host secure-chroma.example.com \
  --target-port 443 \
  --proxy-port 5001
```

## 🐛 Troubleshooting

### Common Issues

#### Connection Refused
- **Symptom**: Cannot connect to Chroma database
- **Solution**: Verify Chroma is running and accessible
- **Check**: `curl http://localhost:8000/api/v1/heartbeat`

#### CORS Errors
- **Symptom**: "Access blocked by CORS policy"
- **Solution**: Use the included proxy server
- **Command**: `python3 proxy-server.py --target-host YOUR_HOST`

#### Empty Collections
- **Symptom**: Collections load but show no data
- **Solution**: Verify collection contains documents
- **Debug**: Check browser console for API errors

#### 400/422 Errors
- **Symptom**: HTTP errors when loading collection data
- **Solution**: The app automatically tries multiple API formats
- **Note**: Some Chroma versions have different API requirements

### Debug Mode

Enable detailed logging by opening browser console (F12) and monitoring:
- Connection attempts
- API requests and responses
- Error messages and stack traces

### Performance Tips

1. **Large Collections**: Use search/filter to limit displayed data
2. **Slow Connections**: Increase timeout in proxy-server.py
3. **Memory Usage**: Close unused browser tabs when working with large datasets

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature-name`
3. **Make your changes** and test thoroughly
4. **Submit a pull request** with a clear description

### Development Guidelines
- Maintain compatibility with vanilla JavaScript
- Follow existing code style and organization
- Test with multiple Chroma versions
- Ensure responsive design works on all devices

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Support

### Getting Help
- **Issues**: Report bugs via GitHub Issues
- **Questions**: Check existing issues or create new ones
- **Feature Requests**: Submit detailed proposals via GitHub Issues

### Known Limitations
- **Large Datasets**: Very large collections may impact browser performance
- **Real-time Updates**: Changes to Chroma data require manual refresh
- **Authentication**: Currently supports only unauthenticated connections

## 🔄 Version History

### v1.0.0 (Current)
- Initial release with full Chroma integration
- Responsive web interface
- CORS proxy support
- Configurable connections
- Multiple view modes

## 🙏 Acknowledgments

- **Chroma Team** for creating an excellent vector database
- **Contributors** who helped test and improve this tool
- **Community** for feedback and feature suggestions

---

**Made with ❤️ for the Chroma community**

For more information about Chroma, visit [trychroma.com](https://trychroma.com)