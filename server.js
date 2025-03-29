// ✅ server.js เวอร์ชันเต็ม พร้อมระบบ login, UNO, สถิติ, แชท
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

let players = {};
const PLAYER_FILE = './players.json';

// โหลดข้อมูลผู้เล่นจากไฟล์ (ถ้ามี)
if (fs.existsSync(PLAYER_FILE)) {
  players = JSON.parse(fs.readFileSync(PLAYER_FILE));
}

const rooms = {};
const hands = {};
const piles = {};
const turnIndex = {};
const playerOrder = {};
const calledUno = {};

app.get('/', (req, res) => {
  res.send('UNO server is running.');
});

function savePlayers() {
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(players, null, 2));
}

function generateDeck() {
  const colors = ['R', 'G', 'B', 'Y'];
  const numbers = ['0','1','2','3','4','5','6','7','8','9'];
  let deck = [];
  for (let color of colors) {
    for (let num of numbers) {
      deck.push(color + num);
      if (num !== '0') deck.push(color + num);
    }
  }
  for (let i = 0; i < 4; i++) deck.push('WILD', 'DRAW4');
  return deck.sort(() => Math.random() - 0.5);
}

function nextTurn(roomId) {
  const playersInRoom = playerOrder[roomId];
  if (!playersInRoom || playersInRoom.length === 0) return;
  turnIndex[roomId] = (turnIndex[roomId] + 1) % playersInRoom.length;
  const current = playersInRoom[turnIndex[roomId]];
  io.to(roomId).emit('turn', current);
}

io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id);

  socket.on('join-play', ({ room, name, password }) => {
    if (!players[name]) {
      players[name] = { password, stats: { wins: 0, losses: 0, unoCalls: 0 } };
      savePlayers();
    } else if (players[name].password !== password) {
      socket.emit('error-message', 'รหัสผ่านไม่ถูกต้อง');
      return;
    }

    socket.join(room);
    if (!rooms[room]) rooms[room] = [];
    if (!hands[room]) hands[room] = {};
    if (!piles[room]) {
      const deck = generateDeck();
      piles[room] = [deck.pop()];
      rooms[room].deck = deck;
    }

    const player = { id: socket.id, name };
    rooms[room].push(player);
    playerOrder[room] = rooms[room].map(p => p.id);
    calledUno[socket.id] = false;

    const hand = [];
    for (let i = 0; i < 5; i++) hand.push(rooms[room].deck.pop());
    hands[room][socket.id] = hand;

    io.to(room).emit('player-list', rooms[room]);
    socket.emit('deal-hand', hand);
    socket.emit('update-pile', piles[room][piles[room].length - 1]);
    if (playerOrder[room].length === 1) {
      turnIndex[room] = 0;
      io.to(room).emit('turn', socket.id);
    }

    socket.on('play-card', ({ room, card, index }) => {
      const hand = hands[room][socket.id];
      const top = piles[room][piles[room].length - 1];
      const valid = card === 'WILD' || card === 'DRAW4' || card[0] === top[0] || card.slice(1) === top.slice(1);
      if (!valid) return;

      hand.splice(index, 1);
      piles[room].push(card);
      socket.emit('deal-hand', hand);
      io.to(room).emit('update-pile', card);

      if (hand.length === 1 && !calledUno[socket.id]) {
        hand.push(rooms[room].deck.pop(), rooms[room].deck.pop());
        socket.emit('deal-hand', hand);
      }

      if (hand.length === 0) {
        const winner = players[name];
        if (winner) winner.stats.wins++;
        rooms[room].forEach(p => {
          if (p.name !== name && players[p.name]) players[p.name].stats.losses++;
        });
        savePlayers();
        io.to(room).emit('win', name);
        return;
      }
      nextTurn(room);
    });

    socket.on('draw-card', (room) => {
      const card = rooms[room].deck.pop();
      hands[room][socket.id].push(card);
      socket.emit('drawn-card', card);
      socket.emit('deal-hand', hands[room][socket.id]);
      nextTurn(room);
    });

    socket.on('call-uno', (room) => {
      calledUno[socket.id] = true;
      const name = rooms[room].find(p => p.id === socket.id)?.name;
      if (players[name]) players[name].stats.unoCalls++;
      savePlayers();
    });

    socket.on('chat', ({ room, message }) => {
      const name = rooms[room].find(p => p.id === socket.id)?.name || 'ผู้เล่น';
      io.to(room).emit('chat', { name, message });
    });

    socket.on('disconnect', () => {
      for (let roomId in rooms) {
        rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);
        delete hands[roomId]?.[socket.id];
        io.to(roomId).emit('player-list', rooms[roomId]);
      }
      console.log('❌ Disconnected:', socket.id);
    });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 UNO server running on port ${PORT}`));
