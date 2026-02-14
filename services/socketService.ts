import { io, Socket } from 'socket.io-client';
import { DrawLine, CursorPosition, User, DrawShape, FillAction, ChatMessage, CanvasAction, DrawStroke } from '../types';

// Detect environment: 
// If running via 'npm run dev' (Vite), connect to localhost:3001.
// If running via 'npm start' (Production/Node), connect to the same origin (relative path).
const isProduction = (import.meta as any).env?.PROD ?? false;
const SERVER_URL = isProduction ? undefined : 'http://localhost:3001';

type EventHandler = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private channel: BroadcastChannel | null = null;
  private isMockMode: boolean = false;
  private eventListeners: Map<string, EventHandler[]> = new Map();
  public currentUserId: string = '';
  
  // Mock State
  private mockHistory: CanvasAction[] = [];
  private mockRedoStack: CanvasAction[] = [];
  private mockUsers: User[] = []; // Track users in mock mode
  
  // Throttle control
  private lastCursorEmit: number = 0;

  constructor() {
    try {
        this.socket = io(SERVER_URL as string, {
            autoConnect: false,
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 2,
            timeout: 2000
        });
    } catch (e) {
        console.warn("Socket.io client failed to initialize, falling back to mock.");
        this.enableMockMode();
    }
  }

  private enableMockMode() {
    if (this.isMockMode) return;
    this.isMockMode = true;
    this.channel = new BroadcastChannel('copaint_demo_channel');
    this.channel.onmessage = (event) => {
        const { type, payload } = event.data;
        // Handle mock interactions
        if (type === 'kick_user_request' && payload.userId === this.currentUserId) {
            this.trigger('user_kicked', {});
            return;
        }
        if (type === 'user_left_update') {
            this.trigger('user_left', { userId: payload.userId });
            return;
        }
        this.trigger(type, payload);
    };
    
    // Simulate a random ID if not already set
    if (!this.currentUserId) {
        this.currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    }
  }

  // Helper to add to mock history
  private mockAddToHistory(action: CanvasAction) {
      this.mockHistory.push(action);
      this.mockRedoStack = [];
      if (this.mockHistory.length > 500) {
          this.mockHistory.shift();
      }
  }

  public connect() {
    if (!this.isMockMode && this.socket) {
        this.socket.connect();
        
        this.socket.on('connect', () => {
            this.currentUserId = this.socket?.id || '';
        });
        
        this.socket.on('connect_error', () => {
            if (!isProduction) {
                this.enableMockMode();
                this.trigger('connect', {});
            }
        });

        if (!isProduction) {
            setTimeout(() => {
                if (!this.socket?.connected && !this.isMockMode) {
                     this.socket?.disconnect();
                     this.enableMockMode();
                     this.trigger('connect', {});
                }
            }, 800);
        }

        const events = [
            'room_joined', 'user_joined', 'user_left', 'game_started', 
            'draw_line', 'history_action', 'history_sync', 
            'clear_canvas', 'cursor_move', 'chat_message', 
            'user_kicked', 'room_updated'
        ];
        events.forEach(evt => {
            this.socket?.on(evt, (data) => this.trigger(evt, data));
        });
    } else {
        this.enableMockMode();
        setTimeout(() => {
            this.trigger('connect', {});
        }, 100);
    }
  }

  public disconnect() {
    if (this.socket) this.socket.disconnect();
    if (this.channel) this.channel.close();
  }

  public leaveRoom(roomId: string) {
    if (this.isMockMode) {
        // Mock leave logic
        this.channel?.postMessage({ 
            type: 'user_left_update', 
            payload: { userId: this.currentUserId } 
        });
    } else {
        this.socket?.emit('leave_room', { roomId });
    }
    this.eventListeners.clear();
    this.mockHistory = [];
    this.mockRedoStack = [];
    this.mockUsers = [];
  }

  public createRoom(username: string): string {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    if (this.isMockMode) {
        const user: User = { id: this.currentUserId, username, isHost: true, color: '#3b82f6' };
        this.mockUsers = [user];
        this.mockHistory = [];
        setTimeout(() => {
            this.trigger('room_joined', { roomId, users: [user] });
        }, 100);
    } else {
        this.socket?.emit('create_room', { username });
    }
    return roomId;
  }

  public joinRoom(roomId: string, username: string) {
    if (this.isMockMode) {
        const user: User = { id: this.currentUserId, username, isHost: false, color: '#10b981' };
        // We can't easily sync local mock users across browser tabs without more complex logic, 
        // but for a demo, we assume the joiner gets added.
        this.channel?.postMessage({
            type: 'user_joined',
            payload: user
        });
        setTimeout(() => {
            // In mock, we don't know the other users perfectly, so we just return ourselves + dummy if any
            this.trigger('room_joined', { roomId, users: [user] }); 
            this.trigger('history_sync', [...this.mockHistory]);
        }, 100);
    } else {
        this.socket?.emit('join_room', { roomId, username });
    }
  }

  public kickUser(roomId: string, userId: string) {
    if (this.isMockMode) {
        this.channel?.postMessage({
            type: 'kick_user_request',
            payload: { userId }
        });
        // Locally trigger removal from list if we are maintaining it
        this.trigger('user_left', { userId });
    } else {
        this.socket?.emit('kick_user', { roomId, userId });
    }
  }

  public startGame(roomId: string) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'game_started', payload: { roomId } });
        this.trigger('game_started', { roomId });
    } else {
        this.socket?.emit('start_game', { roomId });
    }
  }

  // --- Drawing & Actions ---

  public emitDrawLine(roomId: string, data: DrawLine) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'draw_line', payload: data });
    } else {
        this.socket?.emit('draw_line', { roomId, data });
    }
  }

  public emitStroke(roomId: string, action: CanvasAction) {
    if (this.isMockMode) {
        this.mockAddToHistory(action);
        this.channel?.postMessage({ type: 'history_action', payload: action });
        this.trigger('history_action', action);
    } else {
        this.socket?.emit('draw_stroke', { roomId, action });
    }
  }

  public emitShape(roomId: string, action: CanvasAction) {
    if (this.isMockMode) {
        this.mockAddToHistory(action);
        this.channel?.postMessage({ type: 'history_action', payload: action });
        this.trigger('history_action', action);
    } else {
        this.socket?.emit('draw_shape', { roomId, action });
    }
  }

  public emitText(roomId: string, action: CanvasAction) {
    if (this.isMockMode) {
        this.mockAddToHistory(action);
        this.channel?.postMessage({ type: 'history_action', payload: action });
        this.trigger('history_action', action);
    } else {
        this.socket?.emit('draw_text', { roomId, action });
    }
  }

  public emitFill(roomId: string, action: CanvasAction) {
    if (this.isMockMode) {
        this.mockAddToHistory(action);
        this.channel?.postMessage({ type: 'history_action', payload: action });
        this.trigger('history_action', action);
    } else {
        this.socket?.emit('fill_canvas', { roomId, action });
    }
  }

  public emitClear(roomId: string, action: CanvasAction) {
    if (this.isMockMode) {
        this.mockAddToHistory(action);
        this.channel?.postMessage({ type: 'history_action', payload: action });
        this.trigger('history_action', action);
    } else {
        this.socket?.emit('clear_canvas', { roomId, action });
    }
  }

  public emitUndo(roomId: string) {
    if (this.isMockMode) {
        if (this.mockHistory.length === 0) return;
        const action = this.mockHistory.pop();
        if (action) this.mockRedoStack.push(action);
        this.trigger('history_sync', [...this.mockHistory]);
    } else {
        this.socket?.emit('undo', { roomId });
    }
  }

  public emitRedo(roomId: string) {
    if (this.isMockMode) {
        if (this.mockRedoStack.length === 0) return;
        const action = this.mockRedoStack.pop();
        if (action) this.mockHistory.push(action);
        this.trigger('history_sync', [...this.mockHistory]);
    } else {
        this.socket?.emit('redo', { roomId });
    }
  }

  public emitCursor(roomId: string, data: CursorPosition) {
    const now = Date.now();
    if (now - this.lastCursorEmit < 30) return; // Slightly faster for mobile
    this.lastCursorEmit = now;

    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'cursor_move', payload: data });
    } else {
        this.socket?.emit('cursor_move', { roomId, data });
    }
  }

  public emitChatMessage(roomId: string, message: ChatMessage) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'chat_message', payload: message });
        this.trigger('chat_message', message);
    } else {
        this.socket?.emit('chat_message', { roomId, message });
    }
  }

  public on(event: string, callback: EventHandler) {
    if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  public off(event: string, callback: EventHandler) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
        this.eventListeners.set(event, listeners.filter(cb => cb !== callback));
    }
  }

  private trigger(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
        listeners.forEach(cb => cb(data));
    }
  }
}

export const socketService = new SocketService();