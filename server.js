const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os-utils');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('A client connected');

  let previousBytesReceived = 0;
  let previousBytesSent = 0;
  let mainInterface = null;

  // Function to find the main internet interface
  const findMainInterface = () => {
    exec("ip route get 8.8.8.8 | awk '{print $5}'", (error, stdout) => {
      if (error) {
        console.error(`Error finding main interface: ${error}`);
        return;
      }
      mainInterface = stdout.trim();
      console.log(`Main interface detected: ${mainInterface}`);
    });
  };

  // Find the main interface initially
  findMainInterface();

  // Update system data at intervals
  setInterval(() => {
    os.cpuUsage((cpuUsage) => {
      const memoryUsage = 1 - os.freememPercentage();

      // Fetch processes with their PIDs and commands
      exec('ps -e', (error, stdout) => {
        if (error) {
          console.error(`Error executing command: ${error}`);
          return;
        }

        // Parse the output of ps -e
        const processList = stdout
          .split('\n')
          .slice(1) // Skip the header line
          .filter((line) => line.trim()) // Remove any empty lines
          .map((line) => {
            const parts = line.trim().split(/\s+/); // Split by whitespace
            const pid = parts[0];
            const cmd = parts.slice(3).join(' '); // Join the remaining parts as the command
            return { pid, cmd };
          });

        const processCount = processList.length;

        // Get network stats
        exec("cat /proc/net/dev", (error, stdout) => {
          if (error) {
            console.error(`Error fetching network stats: ${error}`);
            return;
          }

          const lines = stdout.split('\n');
          const stats = lines
            .slice(2) // Skip the headers
            .map((line) => line.trim().split(/\s+/))
            .filter((parts) => parts[0].includes(mainInterface + ':')); // Filter by main interface

          if (stats.length > 0) {
            const [interfaceName, bytesReceived, , , , , , , bytesSent] = stats[0].map(Number);

            const downloadSpeed =
              (bytesReceived - previousBytesReceived) / 1024; // KB/s
            const uploadSpeed =
              (bytesSent - previousBytesSent) / 1024; // KB/s

            previousBytesReceived = bytesReceived;
            previousBytesSent = bytesSent;

            // Get disk usage stats
            exec("df -BG --output=size,used -x tmpfs -x devtmpfs", (error, stdout) => {
              if (error) {
                console.error(`Error fetching disk stats: ${error}`);
                return;
              }

              const diskStats = stdout
                .split('\n')
                .slice(1) // Skip the header
                .filter((line) => line.trim()) // Remove empty lines
                .map((line) => {
                  const parts = line.trim().split(/\s+/); // Split by whitespace
                  return {
                    size: parseInt(parts[0].replace('G', '')), // Total size in GB
                    used: parseInt(parts[1].replace('G', '')), // Used size in GB
                  };
                });

              const totalSize = diskStats.reduce((acc, curr) => acc + curr.size, 0);
              const totalUsed = diskStats.reduce((acc, curr) => acc + curr.used, 0);

              socket.emit('systemData', {
                cpuUsage: cpuUsage * 100,
                memoryUsage: memoryUsage * 100,
                processCount,
                processList,
                downloadSpeed: downloadSpeed.toFixed(2), // KB/s
                uploadSpeed: uploadSpeed.toFixed(2), // KB/s
                diskUsage: { total: totalSize, used: totalUsed }, // Total and used disk space
              });
            });
          } else {
            console.warn(`No stats found for interface: ${mainInterface}`);
          }
        });
      });
    });
  }, 1000);

  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

// Listen on 0.0.0.0 to accept connections from any IP
server.listen(3000, '0.0.0.0', () => {
  console.log('Server is running on http://0.0.0.0:3000');
});
