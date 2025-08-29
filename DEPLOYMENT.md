# 🚀 Deployment Guide

This guide covers different deployment scenarios for the Chroma Database Explorer.

## 📁 Local File System

**Simplest setup for local development:**

1. Download/clone the project files
2. Open `index.html` directly in your browser
3. Configure connection to your local Chroma instance

**Limitations:** CORS restrictions may prevent connections to remote servers.

## 🌐 Local HTTP Server

**Recommended for development and testing:**

```bash
# Using the included Python server
python3 serve.py

# Alternative: Python built-in server
python3 -m http.server 8080

# Alternative: Node.js http-server
npx http-server -p 8080
```

**Benefits:** No CORS issues, full functionality, easy to share locally.

## 🔗 Remote Chroma Connections

**For accessing remote Chroma databases:**

### Option 1: CORS Proxy (Recommended)
```bash
# Start proxy server
python3 proxy-server.py --target-host YOUR_CHROMA_HOST --target-port 8000 --proxy-port 5001

# Configure web app to use localhost:5001
```

### Option 2: Chroma Server CORS Configuration
Configure your Chroma server to allow CORS requests:
```python
# In your Chroma server configuration
chroma_client = chromadb.HttpClient(
    host="0.0.0.0",
    port=8000,
    settings=Settings(
        allow_reset=True,
        cors_allow_origins=["http://localhost:8080", "https://yourdomain.com"]
    )
)
```

## 🐳 Docker Deployment

**Containerized deployment:**

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```bash
# Build and run
docker build -t chroma-explorer .
docker run -p 8080:80 chroma-explorer
```

## ☁️ Static Hosting

**Deploy to static hosting services:**

### GitHub Pages
1. Push code to GitHub repository
2. Enable GitHub Pages in repository settings
3. Access via `https://username.github.io/repository-name`

### Netlify
1. Connect your Git repository
2. Set build command: (none needed)
3. Set publish directory: `/`
4. Deploy automatically on git push

### Vercel
```bash
npm install -g vercel
vercel
```

### AWS S3 + CloudFront
1. Upload files to S3 bucket
2. Enable static website hosting
3. Configure CloudFront for global distribution

## 🔐 Production Considerations

### Security
- Use HTTPS in production
- Implement authentication if needed
- Configure proper CORS headers
- Validate input data

### Performance
- Enable gzip compression
- Use CDN for static assets
- Implement caching headers
- Optimize images and fonts

### Monitoring
- Set up error tracking
- Monitor API response times
- Track user interactions
- Log connection issues

## 🌍 Environment-Specific Configurations

### Development
```bash
# Local Chroma + Local web server
python3 serve.py
# Access: http://localhost:8080
```

### Staging
```bash
# Remote Chroma + CORS proxy
python3 proxy-server.py --target-host 203.0.113.20 --target-port 8000 --proxy-port 5001
# Deploy web app to staging environment
```

### Production
```bash
# Production Chroma with proper CORS
# Deploy to CDN/static hosting
# Monitor with proper logging
```

## 🔧 Configuration Management

### Environment Variables
```bash
export CHROMA_HOST=203.0.113.30
export CHROMA_PORT=443
export CHROMA_PROTOCOL=https
```

### Configuration Files
Create `config.json` for different environments:
```json
{
  "development": {
    "host": "localhost",
    "port": 8000,
    "protocol": "http"
  },
  "production": {
    "host": "chroma.example.com",
    "port": 443,
    "protocol": "https"
  }
}
```

## 📊 Monitoring & Analytics

### Error Tracking
Integrate with services like:
- Sentry
- Rollbar
- LogRocket

### Analytics
Track usage with:
- Google Analytics
- Mixpanel
- Custom analytics

### Health Checks
Monitor:
- Connection status
- API response times
- Error rates
- User engagement

## 🚨 Troubleshooting Deployments

### Common Issues

**CORS Errors in Production:**
- Use CORS proxy
- Configure server CORS headers
- Ensure proper domain whitlisting

**Slow Loading:**
- Optimize assets
- Use CDN
- Enable compression
- Check network connectivity

**Connection Failures:**
- Verify Chroma server accessibility
- Check firewall settings
- Validate SSL certificates
- Test network connectivity

### Debug Tools
```bash
# Test Chroma connectivity
curl https://203.0.113.40:8000/api/v1/heartbeat

# Check proxy status
curl http://localhost:5001/api/v1/heartbeat

# Monitor network requests
# Use browser developer tools Network tab
```

## 📝 Maintenance

### Regular Tasks
- Monitor error logs
- Update dependencies
- Test with new Chroma versions
- Backup configuration data
- Review security settings

### Updates
- Test new versions in staging
- Maintain backward compatibility
- Document breaking changes
- Communicate with users

---

For specific deployment questions, please check the main README.md or open an issue.
