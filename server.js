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

// ✅ ให้ Render ตรวจสอบ root path ได้
app.get('/', (req, res) => {
  res.send('✅ UNO Server is up and running!');
});

// 🧠 ฟังก์ชันแจกการ์ดจำลอง
function generateHand() {
  const colors = ['R', 'G', 'B', 'Y'];
  const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const hand = Array.from({ length: 5 }, () => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const value = values[Math.floor(Math.random() * values.length)];
    return color + value;
  });
  hand.push('WILD');
  return hand;
}

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // เข้าห้อง lobby
  socket.on('join-room', ({ roomId, name, avatar }) => {
    if (!rooms[roomId]) rooms[roomId] = [];

    if (rooms[roomId].length >= 10) {
      socket.emit('room-full');
      return;
    }

    const player = { id: socket.id, name, avatar };
    rooms[roomId].push(player);
    socket.join(roomId);

    io.to(roomId).emit('player-list', rooms[roomId]);

    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);
      io.to(roomId).emit('player-list', rooms[roomId]);
      console.log('❌ User disconnected:', socket.id);
    });
  });

  // เข้าห้องเกม (เริ่มเล่น)
  socket.on('join-play', ({ room, name }) => {
    if (!rooms[room]) return;
    socket.join(room);

    const hand = generateHand();
    const topCard = 'R1';

    socket.emit('deal-hand', hand);
    socket.emit('update-pile', topCard);
    io.to(room).emit('player-list', rooms[room]);
  });

  // เล่นไพ่
  socket.on('play-card', ({ room, card, index }) => {
    console.log(`🃏 ${socket.id} played ${card} in room ${room}`);
    io.to(room).emit('update-pile', card);
  });

  // จั่วการ์ด
  socket.on('draw-card', (room) => {
    const newCard = generateHand()[0];
    socket.emit('deal-hand', [newCard]); // ส่งการ์ดใบใหม่อย่างเดียว
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 UNO Server is live on port ${PORT}`);
});
