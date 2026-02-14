import React, { useState, useEffect } from 'react';
import { socketService } from './services/socketService';
import WelcomeScreen from './components/WelcomeScreen';
import LobbyScreen from './components/LobbyScreen';
import PaintCanvas from './components/PaintCanvas';
import { AppState, RoomData, User } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.WELCOME);
  const [roomId, setRoomId] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // Initial connection attempt
    socketService.connect();

    const handleRoomJoined = (data: RoomData) => {
      console.log("Room joined:", data);
      setRoomId(data.roomId);
      setUsers(data.users);
      const me = data.users.find(u => u.id === socketService.currentUserId);
      if (me) {
          setCurrentUser(me);
          setAppState(AppState.LOBBY);
      }
    };

    const handleUserJoined = (user: User) => {
      setUsers(prev => {
        if (prev.find(u => u.id === user.id)) return prev;
        return [...prev, user];
      });
    };
    
    const handleUserLeft = ({ userId }: { userId: string }) => {
        setUsers(prev => prev.filter(u => u.id !== userId));
    };

    const handleGameStarted = () => {
      setAppState(AppState.CANVAS);
    };

    const handleUserKicked = () => {
        alert("Вы были исключены из комнаты хостом.");
        handleExit();
    };

    const handleRoomUpdated = (data: { users: User[] }) => {
        setUsers(data.users);
        // Update current user isHost status if changed
        const me = data.users.find(u => u.id === socketService.currentUserId);
        if (me) {
            setCurrentUser(me);
        }
    };

    socketService.on('room_joined', handleRoomJoined);
    socketService.on('user_joined', handleUserJoined);
    socketService.on('user_left', handleUserLeft);
    socketService.on('game_started', handleGameStarted);
    socketService.on('user_kicked', handleUserKicked);
    socketService.on('room_updated', handleRoomUpdated);

    return () => {
      // Don't disconnect here on unmount, we manage it manually
    };
  }, []);

  const handleCreate = (username: string) => {
    socketService.createRoom(username);
  };

  const handleJoin = (username: string, inputRoomId: string) => {
    socketService.joinRoom(inputRoomId, username);
  };

  const handleStartGame = () => {
    socketService.startGame(roomId);
  };

  const handleExit = () => {
    // Graceful exit instead of reload
    socketService.leaveRoom(roomId);
    
    // Reset state
    setAppState(AppState.WELCOME);
    setRoomId('');
    setUsers([]);
    setCurrentUser(null);
    
    // Re-connect for fresh session
    socketService.disconnect();
    setTimeout(() => {
        socketService.connect();
    }, 100);
  };

  return (
    <div className="font-sans w-full h-screen overflow-hidden bg-slate-950">
      {appState === AppState.WELCOME && (
        <WelcomeScreen 
          onCreate={handleCreate} 
          onJoin={handleJoin} 
        />
      )}
      
      {appState === AppState.LOBBY && currentUser && (
        <LobbyScreen 
          roomId={roomId}
          users={users}
          isHost={currentUser.isHost}
          onStart={handleStartGame}
          onExit={handleExit}
        />
      )}

      {appState === AppState.CANVAS && currentUser ? (
        <PaintCanvas 
          roomId={roomId}
          currentUser={currentUser}
          onExit={handleExit}
        />
      ) : appState === AppState.CANVAS ? (
          <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p>Loading canvas...</p>
              </div>
          </div>
      ) : null}
    </div>
  );
};

export default App;
