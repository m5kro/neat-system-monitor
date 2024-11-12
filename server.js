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
          .filter(line => line.trim()) // Remove any empty lines
          .map(line => {
            const parts = line.trim().split(/\s+/); // Split by whitespace
            const pid = parts[0];
            const cmd = parts.slice(3).join(' '); // Join the remaining parts as the command
            return { pid, cmd };
          });

        const processCount = processList.length;

        socket.emit('systemData', {
          cpuUsage: cpuUsage * 100,
          memoryUsage: memoryUsage * 100,
          processCount,
          processList,
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
