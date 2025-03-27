// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {}; // roomId => [ { id, name, avatar } ]

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, name, avatar }) => {
    if (!rooms[roomId]) rooms[roomId] = [];

    // Check max player limit
    if (rooms[roomId].length >= 10) {
      socket.emit('room-full');
      return;
    }

    const player = { id: socket.id, name, avatar };
    rooms[roomId].push(player);
    socket.join(roomId);

    // Notify all players in the room
    io.to(roomId).emit('player-list', rooms[roomId]);

    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);
      io.to(roomId).emit('player-list', rooms[roomId]);
      console.log('User disconnected:', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
