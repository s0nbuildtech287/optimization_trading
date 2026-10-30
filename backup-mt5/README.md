# Backup-MT5

MT5 Log Watcher - Electron desktop tool for watching and copying MT5 terminal log files with pm2 process control, folder backup, optimization workflows, and **real-time system monitoring**.

## Features

### 📋 MT5 Log Watcher
- Monitor MT5 terminal log files (Journal & Experts)
- Automatically copy changes to MQL5/Files directory
- Run as background process with PM2

### 💾 Folder Backup
- Automated folder backup with configurable intervals
- Background process management
- Multiple backup tasks support

### MT5 Workers
- Multi-terminal worker management is being rebuilt
- The legacy local optimization pipeline has been removed

### 📊 **System Monitor** (NEW!)
- **Real-time system metrics collection**:
  - CPU: Brand, cores, load, temperature
  - Memory: Total, used, free, swap
  - Disk: All drives with size and usage
  - Session: Current user, active users, uptime
  - OS: Platform, distro, version
  - Top Processes: CPU and memory usage
- **Push data to remote server** for monitoring
- **Auto-start with configurable interval** (1-3600 seconds)
- **PM2 background process** - runs even when app is closed
- **Unique Machine ID** per device
- **Example server included** with web dashboard

## Quick Start

### Installation

```bash
# Clone repository
git clone https://gitlab.com/dev-trading/backup-mt5.git
cd backup-mt5

# Install dependencies
npm install

# Build project
npm run build

# Start application
npm start
```

### System Monitor Quick Start

1. **Start example server** (optional - for testing):
   ```bash
   node example-server.js
   ```
   Dashboard: http://localhost:3000

2. **Configure in app**:
   - Open app → Click **📊 System Monitor** tab
   - Server URL: `http://localhost:3000/api/system-info`
   - Interval: `10` seconds
   - Click **▶ Start Monitor**

3. **View results**:
   - Terminal: See real-time logs
   - Browser: http://localhost:3000 (dashboard)
   - PM2: `pm2 logs mt5-system-monitor`

## Documentation

### General
- [Installation Guide](./docs/installation.md) *(if exists)*
- [User Guide](./docs/user-guide.md) *(if exists)*

### System Monitor
- **[📊 System Monitor README](./SYSTEM_MONITOR_README.md)** - Feature documentation
- **[🧪 Testing Guide](./TEST_SYSTEM_MONITOR.md)** - Step-by-step testing
- **[🚀 Quick Start](./QUICK_START.md)** - Quick start guide
- **[📝 Changelog](./CHANGELOG.md)** - Version history
- **[📋 Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Technical details

## Requirements

- **Node.js** 18+ (for native fetch support)
- **PM2** (install globally: `npm install -g pm2`)
- **Windows/Linux/macOS** (cross-platform)

## Project Structure

```
backup-mt5/
├── backend/
│   ├── watcher.ts              # MT5 log watcher service
│   ├── folderBackup.ts         # Folder backup service
│   └── systemMonitor.ts        # System monitor service (NEW!)
├── src/
│   ├── main/                   # Electron main process
│   ├── preload/                # Preload scripts
│   └── renderer/               # React UI
├── scripts/                    # Build scripts
├── example-server.js           # Example monitoring server (NEW!)
└── docs/                       # Documentation
```

## Development

```bash
# Development mode (watch)
npm run dev

# Build
npm run build

# Build specific components
npm run build:backend
npm run build:renderer
npm run build:main

# Package for distribution
npm run dist
```

## PM2 Management

```bash
# List all processes
pm2 list

# View logs
pm2 logs

# Stop all processes
pm2 stop all

# Restart all processes
pm2 restart all

# Delete all processes
pm2 delete all
```

## System Monitor API

### Data Format

Server receives POST requests with JSON:

```json
{
  "machineId": "hostname-mac-address",
  "timestamp": 1234567890000,
  "cpu": { "brand": "...", "currentLoad": 45.2, ... },
  "memory": { "total": 17179869184, "usedPercent": 50.0, ... },
  "disks": [...],
  "session": {...},
  "os": {...},
  "topProcesses": [...]
}
```

### Server Implementation

See `example-server.js` for a complete Express server with web dashboard.

**Minimal server:**
```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/system-info', (req, res) => {
  console.log('Received data from:', req.body.machineId);
  // Save to database, forward to monitoring service, etc.
  res.json({ success: true });
});

app.listen(3000);
```

## Security Notes

⚠️ **For production use:**
- Use HTTPS instead of HTTP
- Add authentication (API key, JWT)
- Implement rate limiting
- Validate input data
- Configure CORS properly

See [SYSTEM_MONITOR_README.md](./SYSTEM_MONITOR_README.md) for security recommendations.

## Troubleshooting

### PM2 not found
```bash
npm install -g pm2
```

### Build errors
```bash
# Clean and rebuild
rm -rf dist backend/*.js
npm run build
```

### System Monitor not sending data
1. Check server is running: `curl http://localhost:3000`
2. Check PM2 logs: `pm2 logs mt5-system-monitor`
3. Check firewall settings

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.

## License

MIT License - See LICENSE file for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.

## Support

For issues and questions:
- Create an issue on GitLab
- Check documentation in `/docs` folder
- Review troubleshooting guides
