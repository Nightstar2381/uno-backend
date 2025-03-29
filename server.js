// server.js เวอร์ชันเต็ม รองรับระบบเล่นเกม UNO พร้อม socket, เทิร์น, คะแนน, สรุปผล, ป้องกันชื่อซ้ำ
const fs = require("fs");
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

let rooms = {}; // roomId -> { players, scores, currentTurn, cards, topCard, usernames, timer }

io.on("connection", socket => {
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);
    if (!rooms[room]) {
      rooms[room] = {
        players: [], scores: {}, currentTurn: 0,
        cards: {}, topCard: {}, usernames: {}, timer: null
      };
    }

    if (rooms[room].players.includes(username)) {
      socket.emit("error", "ชื่อซ้ำในห้องนี้");
      return;
    }

    rooms[room].players.push(username);
    rooms[room].scores[username] = rooms[room].scores[username] || 0;
    rooms[room].cards[username] = generateCards();
    rooms[room].usernames[socket.id] = username;

    io.to(room).emit("joinedRoom", {
      players: rooms[room].players,
      currentTurn: rooms[room].players[rooms[room].currentTurn]
    });
    sendUpdate(room);
    startTurnTimer(room);
  });

  socket.on("playCard", (index, color) => {
    const room = [...socket.rooms][1];
    const username = getUsername(socket, room);
    if (!room || !username) return;

    const current = rooms[room].players[rooms[room].currentTurn];
    if (username !== current) return;

    const card = rooms[room].cards[username][index];
    if (!card) return;

    if (card.value === "WILD" && color) card.color = color;
    rooms[room].topCard = card;
    rooms[room].cards[username].splice(index, 1);

    io.to(room).emit("topCard", card);
    io.to(room).emit("updateHand", rooms[room].cards[username]);

    if (rooms[room].cards[username].length === 0) {
      rooms[room].scores[username] += 1;
      io.to(room).emit("scoreUpdate", rooms[room].scores);
      io.to(room).emit("gameOver", username);
      saveStats(username);
      clearTimeout(rooms[room].timer);
      return;
    }

    advanceTurn(room);
  });

  socket.on("drawCard", () => {
    const room = [...socket.rooms][1];
    const username = getUsername(socket, room);
    if (!room || !username) return;

    rooms[room].cards[username].push(generateCards(1)[0]);
    io.to(room).emit("updateHand", rooms[room].cards[username]);
    advanceTurn(room);
  });

  socket.on("rematchRequest", () => {
    const room = [...socket.rooms][1];
    if (!room) return;

    clearTimeout(rooms[room].timer);
    rooms[room].currentTurn = 0;
    rooms[room].topCard = {};
    for (const name of rooms[room].players) {
      rooms[room].cards[name] = generateCards();
    }

    io.to(room).emit("joinedRoom", {
      players: rooms[room].players,
      currentTurn: rooms[room].players[0]
    });
    sendUpdate(room);
    startTurnTimer(room);
  });

  socket.on("getLeaderboard", () => {
    const data = fs.existsSync("players.json") ? JSON.parse(fs.readFileSync("players.json")) : {};
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    socket.emit("leaderboard", sorted);
  });
});

function advanceTurn(room) {
  clearTimeout(rooms[room].timer);
  rooms[room].currentTurn = (rooms[room].currentTurn + 1) % rooms[room].players.length;
  sendUpdate(room);
  startTurnTimer(room);
}

function sendUpdate(room) {
  const players = rooms[room].players;
  const currentTurn = players[rooms[room].currentTurn];
  const handSizes = Object.fromEntries(players.map(p => [p, rooms[room].cards[p].length]));

  io.to(room).emit("updatePlayers", { players, currentTurn, handSizes });
  io.to(room).emit("updateTurn", currentTurn);
}

function startTurnTimer(room) {
  rooms[room].timer = setTimeout(() => {
    const name = rooms[room].players[rooms[room].currentTurn];
    rooms[room].cards[name].push(generateCards(1)[0]);
    io.to(room).emit("updateHand", rooms[room].cards[name]);
    advanceTurn(room);
  }, 15000);
}

function generateCards(n = 3) {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0", "1", "2", "3", "4", "+2", "Skip", "Reverse", "WILD"];
  const result = [];
  for (let i = 0; i < n; i++) {
    const value = values[Math.floor(Math.random() * values.length)];
    const color = value === "WILD" ? "black" : colors[Math.floor(Math.random() * colors.length)];
    result.push({ color, value });
  }
  return result;
}

function getUsername(socket, room) {
  return rooms[room]?.usernames[socket.id] || null;
}

function saveStats(winner) {
  const file = "players.json";
  let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  data[winner] = data[winner] ? data[winner] + 1 : 1;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
