// server.js สำหรับระบบ UNO พร้อมจัดอันดับและป้องกันโกงชื่อซ้ำ/บันทึก

const fs = require("fs");
const io = require("socket.io")(server);

let rooms = {}; // room: { players: [], scores: {}, currentTurn: 0, topCard: {}, cards: {}, usernames: {} }

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ username, password, room }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { players: [], scores: {}, currentTurn: 0, cards: {}, topCard: {}, usernames: {} };

    // ป้องกันชื่อซ้ำ
    if (rooms[room].players.includes(username)) {
      socket.emit("error", "ชื่อผู้เล่นซ้ำในห้องนี้");
      return;
    }

    rooms[room].players.push(username);
    rooms[room].scores[username] = rooms[room].scores[username] || 0;
    rooms[room].cards[username] = generateCards();
    rooms[room].usernames[socket.id] = username;

    io.to(room).emit("joinedRoom", {
      players: rooms[room].players,
      currentTurn: rooms[room].players[rooms[room].currentTurn],
      yourCards: rooms[room].cards[username]
    });
  });

  socket.on("playCard", (index, color) => {
    const room = [...socket.rooms][1];
    const username = getUsernameInRoom(socket, room);
    if (!room || !username || !rooms[room]) return;

    const currentPlayer = rooms[room].players[rooms[room].currentTurn];
    if (username !== currentPlayer) return;

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
      return;
    }

    advanceTurn(room);
  });

  socket.on("callUNO", () => {
    console.log("UNO Called!");
  });

  socket.on("drawCard", () => {
    const room = [...socket.rooms][1];
    const username = getUsernameInRoom(socket, room);
    if (!room || !username || !rooms[room]) return;

    rooms[room].cards[username].push(generateCards(1)[0]);
    io.to(room).emit("updateHand", rooms[room].cards[username]);
    advanceTurn(room);
  });

  socket.on("rematchRequest", () => {
    const room = [...socket.rooms][1];
    if (!room || !rooms[room]) return;

    rooms[room].currentTurn = 0;
    rooms[room].topCard = {};
    for (const name of rooms[room].players) {
      rooms[room].cards[name] = generateCards();
    }

    io.to(room).emit("joinedRoom", {
      players: rooms[room].players,
      currentTurn: rooms[room].players[0],
      yourCards: rooms[room].cards[rooms[room].players[0]]
    });
    io.to(room).emit("scoreUpdate", rooms[room].scores);
  });

  socket.on("getLeaderboard", () => {
    const file = "players.json";
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file));
    const leaderboard = Object.entries(data).sort((a, b) => b[1] - a[1]);
    socket.emit("leaderboard", leaderboard);
  });
});

function advanceTurn(room) {
  rooms[room].currentTurn = (rooms[room].currentTurn + 1) % rooms[room].players.length;
  io.to(room).emit("updateTurn", rooms[room].players[rooms[room].currentTurn]);
}

function generateCards(n = 3) {
  const colors = ["red", "green", "blue", "yellow"];
  const values = ["0", "1", "2", "3", "4", "+2", "Skip", "Reverse", "WILD"];
  const cards = [];
  for (let i = 0; i < n; i++) {
    const value = values[Math.floor(Math.random() * values.length)];
    const color = value === "WILD" ? "black" : colors[Math.floor(Math.random() * colors.length)];
    cards.push({ color, value });
  }
  return cards;
}

function getUsernameInRoom(socket, room) {
  return rooms[room]?.usernames[socket.id] || null;
}

function saveStats(winner) {
  const file = "players.json";
  let data = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    data = JSON.parse(raw);
  }
  data[winner] = data[winner] ? data[winner] + 1 : 1;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
