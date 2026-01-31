const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, '../dist')));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const rooms = new Map(); 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ username }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const user = {
      id: socket.id,
      username,
      isHost: true,
      color: getRandomColor()
    };

    rooms.set(roomId, [user]);
    socket.join(roomId);
    socket.emit('room_joined', { roomId, users: [user] });
  });

  socket.on('join_room', ({ roomId, username }) => {
    if (!rooms.has(roomId)) {
      socket.emit('error', 'Room not found');
      return;
    }

    const user = {
      id: socket.id,
      username,
      isHost: false,
      color: getRandomColor()
    };

    const users = rooms.get(roomId);
    users.push(user);
    rooms.set(roomId, users);

    socket.join(roomId);
    socket.to(roomId).emit('user_joined', user);
    socket.emit('room_joined', { roomId, users });
  });

  socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId);
      const users = rooms.get(roomId);
      if (users) {
          const index = users.findIndex(u => u.id === socket.id);
          if (index !== -1) {
              users.splice(index, 1);
              socket.to(roomId).emit('user_left', { userId: socket.id });
          }
      }
  });

  socket.on('start_game', ({ roomId }) => {
    io.to(roomId).emit('game_started', { roomId });
  });

  // --- Drawing Events ---

  socket.on('draw_line', ({ roomId, data }) => {
    socket.to(roomId).emit('draw_line', data);
  });

  socket.on('draw_shape', ({ roomId, data }) => {
    socket.to(roomId).emit('draw_shape', data);
  });

  socket.on('draw_text', ({ roomId, data }) => {
    socket.to(roomId).emit('draw_text', data);
  });

  socket.on('fill_canvas', ({ roomId, data }) => {
    socket.to(roomId).emit('fill_canvas', data);
  });

  socket.on('clear_canvas', ({ roomId }) => {
    io.to(roomId).emit('clear_canvas');
  });

  socket.on('cursor_move', ({ roomId, data }) => {
    socket.to(roomId).emit('cursor_move', data);
  });

  // --- Chat Events ---
  
  socket.on('chat_message', ({ roomId, message }) => {
    io.to(roomId).emit('chat_message', message);
  });

  socket.on('disconnect', () => {
    rooms.forEach((users, roomId) => {
      const index = users.findIndex(u => u.id === socket.id);
      if (index !== -1) {
        users.splice(index, 1);
        if (users.length === 0) {
          rooms.delete(roomId);
        } else {
            io.to(roomId).emit('user_left', { userId: socket.id });
        }
      }
    });
  });
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send("Server running. Frontend build not found in ../dist");
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function getRandomColor() {
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#c084fc', '#f472b6'];
    return colors[Math.floor(Math.random() * colors.length)];
}