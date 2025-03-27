const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('UNO Server is running');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-play', ({ room, name }) => {
    if (!rooms[room]) rooms[room] = [];

    const player = { id: socket.id, name };
    rooms[room].push(player);
    socket.join(room);

    // ส่งข้อมูลผู้เล่นทั้งหมดในห้องกลับไปให้ทุกคน
    io.to(room).emit('player-list', rooms[room]);

    // แจกการ์ดตัวอย่าง (เพื่อทดสอบ)
    const hand = ['R5', 'G2', 'B9', 'Y0', 'WILD'];
    socket.emit('deal-hand', hand);

    // ส่ง pile เริ่มต้น (ตัวอย่าง)
    socket.emit('update-pile', 'R2');
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(p => p.id !== socket.id);
      io.to(room).emit('player-list', rooms[room]);
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
