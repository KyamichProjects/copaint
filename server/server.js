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

// Room structure: { users: User[], history: CanvasAction[], redoStack: CanvasAction[] }
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

    rooms.set(roomId, {
      users: [user],
      history: [],
      redoStack: []
    });

    socket.join(roomId);
    socket.emit('room_joined', { roomId, users: [user] });
  });

  socket.on('join_room', ({ roomId, username }) => {
    if (!rooms.has(roomId)) {
      socket.emit('error', 'Room not found');
      return;
    }

    const room = rooms.get(roomId);
    const user = {
      id: socket.id,
      username,
      isHost: false,
      color: getRandomColor()
    };

    room.users.push(user);
    
    socket.join(roomId);
    socket.to(roomId).emit('user_joined', user);
    
    // Emit joined event AND current history to the new user
    socket.emit('room_joined', { roomId, users: room.users });
    socket.emit('history_sync', room.history);
  });

  const handleLeave = (roomId, socketId) => {
      const room = rooms.get(roomId);
      if (room) {
          const index = room.users.findIndex(u => u.id === socketId);
          if (index !== -1) {
              const wasHost = room.users[index].isHost;
              room.users.splice(index, 1);
              
              // Host migration
              if (wasHost && room.users.length > 0) {
                  room.users[0].isHost = true;
                  io.to(roomId).emit('room_updated', { users: room.users }); // Notify about new host
              }

              if (room.users.length === 0) {
                  rooms.delete(roomId);
              } else {
                  io.to(roomId).emit('user_left', { userId: socketId });
              }
          }
      }
  };

  socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId);
      handleLeave(roomId, socket.id);
  });

  socket.on('kick_user', ({ roomId, userId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      // Verify requester is host
      const requester = room.users.find(u => u.id === socket.id);
      if (!requester || !requester.isHost) return;

      const targetSocket = io.sockets.sockets.get(userId);
      if (targetSocket) {
          targetSocket.leave(roomId);
          targetSocket.emit('user_kicked');
      }

      handleLeave(roomId, userId);
  });

  socket.on('start_game', ({ roomId }) => {
    io.to(roomId).emit('game_started', { roomId });
  });

  // --- Drawing Events ---

  // Ephemeral drawing (for real-time feedback, not saved to history directly)
  socket.on('draw_line', ({ roomId, data }) => {
    socket.to(roomId).emit('draw_line', data);
  });

  // --- History Management Helpers ---
  const addToHistory = (roomId, action) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.history.push(action);
    room.redoStack = []; // Clear redo stack on new action
    
    // Limit history size to prevent memory issues (optional, e.g., 500 actions)
    if (room.history.length > 500) {
        room.history.shift();
    }
  };

  socket.on('draw_stroke', ({ roomId, action }) => {
    addToHistory(roomId, action);
    io.to(roomId).emit('history_action', action); 
  });

  socket.on('draw_shape', ({ roomId, action }) => {
    addToHistory(roomId, action);
    io.to(roomId).emit('history_action', action); 
  });

  socket.on('draw_text', ({ roomId, action }) => {
    addToHistory(roomId, action);
    io.to(roomId).emit('history_action', action);
  });

  socket.on('fill_canvas', ({ roomId, action }) => {
    addToHistory(roomId, action);
    io.to(roomId).emit('history_action', action);
  });

  socket.on('clear_canvas', ({ roomId, action }) => {
    addToHistory(roomId, action);
    io.to(roomId).emit('history_action', action);
  });

  // --- Undo / Redo ---

  socket.on('undo', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.history.length === 0) return;

    const action = room.history.pop();
    room.redoStack.push(action);

    io.to(roomId).emit('history_sync', room.history);
  });

  socket.on('redo', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.redoStack.length === 0) return;

    const action = room.redoStack.pop();
    room.history.push(action);

    io.to(roomId).emit('history_sync', room.history);
  });

  socket.on('cursor_move', ({ roomId, data }) => {
    socket.to(roomId).emit('cursor_move', data);
  });

  // --- Chat Events ---
  
  socket.on('chat_message', ({ roomId, message }) => {
    io.to(roomId).emit('chat_message', message);
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      // We check if the socket was in this room
      const user = room.users.find(u => u.id === socket.id);
      if (user) {
          handleLeave(roomId, socket.id);
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