
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Servidor de Futbol Arcade funcionando");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  for (const player of room.players) {
    send(player, data);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Mensaje no válido" });
    }

    if (msg.type === "create") {
      if (ws.room) {
        return send(ws, { type: "error", message: "Ya estás en una sala" });
      }

      let code;
      do {
        code = Math.random().toString(36).slice(2, 8).toUpperCase();
      } while (rooms.has(code));

      const room = { code, players: [ws] };
      rooms.set(code, room);
      ws.room = room;

      return send(ws, {
        type: "created",
        code,
        players: 1,
        maxPlayers: 6
      });
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return send(ws, { type: "error", message: "Sala no encontrada" });
      }

      if (room.players.length >= 6) {
        return send(ws, { type: "error", message: "Sala llena" });
      }

      if (ws.room) {
        return send(ws, { type: "error", message: "Ya estás en una sala" });
      }

      room.players.push(ws);
      ws.room = room;

      broadcast(room, {
        type: "players",
        code,
        players: room.players.length,
        maxPlayers: 6
      });
      return;
    }

    if (msg.type === "ready") {
      const room = ws.room;
      if (!room) {
        return send(ws, { type: "error", message: "Entra a una sala primero" });
      }

      if (room.players.length !== 2 &&
          room.players.length !== 4 &&
          room.players.length !== 6) {
        return send(ws, {
          type: "waiting",
          players: room.players.length,
          message: "Se necesitan 2, 4 o 6 jugadores"
        });
      }

      broadcast(room, {
        type: "start",
        players: room.players.length
      });
      return;
    }

    if (msg.type === "game") {
      const room = ws.room;
      if (!room) return;

      // Reenvía los datos del juego a los demás jugadores.
      for (const player of room.players) {
        if (player !== ws) send(player, {
          type: "game",
          data: msg.data
        });
      }
    }
  });

  ws.on("close", () => {
    const room = ws.room;
    if (!room) return;

    room.players = room.players.filter((player) => player !== ws);

    if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      broadcast(room, {
        type: "players",
        code: room.code,
        players: room.players.length,
        maxPlayers: 6
      });
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${port}`);
});
