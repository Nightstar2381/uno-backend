const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const rooms = {};
let players = {};

// โหลด players.json ถ้ามี
try {
  const data = fs.readFileSync("players.json", "utf8");
  players = JSON.parse(data);
} catch (e) {
  players = {};
}

function generateRandomCards(num = 7) {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const values = ['0','1','2','3','4','5','6','7','8','9','+2','Skip','Reverse','WILD'];
  const cards = [];
  for (let i = 0; i < num; i++) {
    const value = values[Math.floor(Math.random() * values.length)];
    const color = value === 'WILD' ? 'black' : colors[Math.floor(Math.random() * colors.length)];
    cards.push({ color, value });
  }
  return cards;
}

function canPlayCard(card, topCard) {
  return (
    card.color === topCard.color ||
    card.value === topCard.value ||
    card.color === 'black'
  );
}

function savePlayers() {
  fs.writeFileSync("players.json", JSON.stringify(players, null, 2));
}

function startTurnTimer(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);

  const names = Object.keys(room.players);
  const current = names[room.turnIndex];
  const socketId = room.players[current].socketId;

  room.timer = setTimeout(() => {
    // ลงโทษ: จั่ว 1 ใบ
    const drawn = generateRandomCards(1);
    room.players[current].cards.push(...drawn);
    io.to(socketId).emit("updateHand", room.players[current].cards);
    io.to(roomName).emit("specialEffect", `${current} หมดเวลา! ถูกจั่วการ์ด 1 ใบ`);

    // เปลี่ยนเทิร์น
    room.turnIndex = (room.turnIndex + 1) % names.length;
    const next = names[room.turnIndex];

    io.to(roomName).emit("updatePlayers", { players: names, currentTurn: next });
    io.to(roomName).emit("updateTurn", next);
    io.to(room.players[next].socketId).emit("startCountdown", 15);
    startTurnTimer(roomName);
  }, 15000);
}

io.on("connection", socket => {
  socket.on("joinRoom", ({ username, password, room }) => {
    if (!rooms[room]) rooms[room] = { players: {}, turnIndex: 0, topCard: null };

    const roomData = rooms[room];
    if (roomData.players[username]) return;

    roomData.players[username] = {
      socketId: socket.id,
      password,
      cards: generateRandomCards()
    };
    if (!players[username]) players[username] = { win: 0, lose: 0, uno: 0 };

    socket.join(room);

    const names = Object.keys(roomData.players);
    const current = names[roomData.turnIndex];

    io.to(room).emit("updatePlayers", { players: names, currentTurn: current });
    io.to(socket.id).emit("joinedRoom", {
      players: names,
      yourCards: roomData.players[username].cards,
      currentTurn: current
    });
    if (current === username) {
      io.to(socket.id).emit("startCountdown", 15);
      startTurnTimer(room);
    }
  });

  socket.on("playCard", (index, chosenColor) => {
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const names = Object.keys(room.players);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const player = room.players[name];
        if (player.socketId === socket.id && room.turnIndex === i) {
          const card = player.cards[index];
          if (!canPlayCard(card, room.topCard || card)) return;

          player.cards.splice(index, 1);
          room.topCard = { ...card };
          if (card.value === "WILD" && chosenColor) {
            room.topCard.color = chosenColor;
          }

          if (room.timer) clearTimeout(room.timer);

          const nextIndex = (i + 1) % names.length;
          const nextPlayer = names[nextIndex];

          if (card.value === "+2") {
            const drawn = generateRandomCards(2);
            room.players[nextPlayer].cards.push(...drawn);
            io.to(room.players[nextPlayer].socketId).emit("updateHand", room.players[nextPlayer].cards);
            io.to(roomName).emit("specialEffect", `${name} เล่น +2 ใส่ ${nextPlayer}`);
          } else if (card.value === "Skip") {
            room.turnIndex = (room.turnIndex + 2) % names.length;
            io.to(roomName).emit("specialEffect", `${name} ข้ามเทิร์นของ ${nextPlayer}`);
          } else if (card.value === "Reverse") {
            names.reverse();
            room.turnIndex = names.length - 1 - i;
            io.to(roomName).emit("specialEffect", `${name} หมุนลำดับการเล่น!`);
          } else {
            room.turnIndex = (room.turnIndex + 1) % names.length;
          }

          io.to(player.socketId).emit("updateHand", player.cards);

          if (player.cards.length === 0) {
            players[name].win += 1;
            names.forEach(n => { if (n !== name) players[n].lose += 1 });
            savePlayers();
            io.to(roomName).emit("gameOver", name);
            return;
          }

          const nextTurn = names[room.turnIndex];
          io.to(roomName).emit("updatePlayers", { players: names, currentTurn: nextTurn });
          io.to(roomName).emit("updateTurn", nextTurn);
          io.to(room.players[nextTurn].socketId).emit("startCountdown", 15);
          startTurnTimer(roomName);
          return;
        }
      }
    }
  });

  socket.on("callUNO", () => {
    for (const room in rooms) {
      const r = rooms[room];
      for (const username in r.players) {
        if (r.players[username].socketId === socket.id) {
          players[username].uno += 1;
          savePlayers();
        }
      }
    }
  });

  socket.on("getPlayers", () => {
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const names = Object.keys(room.players);
      for (const name of names) {
        if (room.players[name].socketId === socket.id) {
          const current = names[room.turnIndex];
          io.to(roomName).emit("updatePlayers", { players: names, currentTurn: current });
        }
      }
    }
  });

  socket.on("restartGame", () => {
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const names = Object.keys(room.players);
      for (const name of names) {
        if (room.players[name].socketId === socket.id) {
          if (room.timer) clearTimeout(room.timer);
          room.turnIndex = 0;
          room.topCard = null;
          names.forEach(n => {
            room.players[n].cards = generateRandomCards();
            io.to(room.players[n].socketId).emit("updateHand", room.players[n].cards);
          });
          const current = names[room.turnIndex];
          io.to(roomName).emit("updatePlayers", { players: names, currentTurn: current });
          io.to(roomName).emit("updateTurn", current);
          io.to(room.players[current].socketId).emit("startCountdown", 15);
          startTurnTimer(roomName);
        }
      }
    }
  });

  socket.on("chat", msg => {
    for (const roomName in rooms) {
      const room = rooms[roomName];
      for (const name in room.players) {
        if (room.players[name].socketId === socket.id) {
          io.to(roomName).emit("chat", { user: name, message: msg });
        }
      }
    }
  });
});

// REST API สำหรับอันดับ
app.get("/players", (req, res) => {
  res.json(players);
});

server.listen(process.env.PORT || 10000, () => {
  console.log("✅ UNO Server started");
});
