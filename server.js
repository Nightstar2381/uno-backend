// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors({
  origin: ['https://nightstar2381.github.io'], // ✅ ระบุ origin Github Pages
  methods: ['GET', 'POST'],
  credentials: true
}));

app.get('/', (req, res) => {
  res.send('UNO Server is running');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['https://nightstar2381.github.io'],
    methods: ['GET', 'POST']
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-play', ({ room, name }) => {
    if (!rooms[room]) rooms[room] = [];

    const player = { id: socket.id, name };
    rooms[room].push(player);
    socket.join(room);

    io.to(room).emit('player-list', rooms[room]);

    const hand = ['R5', 'G2', 'Y7', 'B1', 'WILD'];
    socket.emit('deal-hand', hand);
    socket.emit('update-pile', 'R1');
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(p => p.id !== socket.id);
      io.to(room).emit('player-list', rooms[room]);
    }
    console.log('❌ Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
