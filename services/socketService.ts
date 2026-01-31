import { io, Socket } from 'socket.io-client';
import { DrawLine, CursorPosition, User, DrawShape, FillAction, DrawText, ChatMessage } from '../types';

// Detect environment: 
// If running via 'npm run dev' (Vite), connect to localhost:3001.
// If running via 'npm start' (Production/Node), connect to the same origin (relative path).
// We use optional chaining because import.meta.env might not be defined in all environments
const isProduction = (import.meta as any).env?.PROD ?? false;
const SERVER_URL = isProduction ? undefined : 'http://localhost:3001';

type EventHandler = (...args: any[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private channel: BroadcastChannel | null = null;
  private isMockMode: boolean = false;
  private eventListeners: Map<string, EventHandler[]> = new Map();
  public currentUserId: string = '';
  
  // Throttle control
  private lastCursorEmit: number = 0;

  constructor() {
    try {
        // If SERVER_URL is undefined, socket.io connects to window.location
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
        this.trigger(type, payload);
    };
    
    // Simulate a random ID if not already set
    if (!this.currentUserId) {
        this.currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
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

        // Fast fallback for dev only
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
            'draw_line', 'draw_shape', 'draw_text', 'fill_canvas', 
            'clear_canvas', 'cursor_move', 'chat_message'
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
        // mock logic
    } else {
        this.socket?.emit('leave_room', { roomId });
    }
    this.eventListeners.clear();
  }

  public createRoom(username: string): string {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    if (this.isMockMode) {
        const user: User = { id: this.currentUserId, username, isHost: true, color: '#3b82f6' };
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
        this.channel?.postMessage({
            type: 'user_joined',
            payload: user
        });
        setTimeout(() => {
            this.trigger('room_joined', { roomId, users: [user] }); 
        }, 100);
    } else {
        this.socket?.emit('join_room', { roomId, username });
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

  public emitDraw(roomId: string, data: DrawLine) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'draw_line', payload: data });
    } else {
        this.socket?.emit('draw_line', { roomId, data });
    }
  }

  public emitShape(roomId: string, data: DrawShape) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'draw_shape', payload: data });
    } else {
        this.socket?.emit('draw_shape', { roomId, data });
    }
  }

  public emitText(roomId: string, data: DrawText) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'draw_text', payload: data });
    } else {
        this.socket?.emit('draw_text', { roomId, data });
    }
  }

  public emitFill(roomId: string, data: FillAction) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'fill_canvas', payload: data });
    } else {
        this.socket?.emit('fill_canvas', { roomId, data });
    }
  }

  public emitClear(roomId: string) {
    if (this.isMockMode) {
        this.channel?.postMessage({ type: 'clear_canvas', payload: {} });
        this.trigger('clear_canvas', {});
    } else {
        this.socket?.emit('clear_canvas', { roomId });
    }
  }

  public emitCursor(roomId: string, data: CursorPosition) {
    const now = Date.now();
    if (now - this.lastCursorEmit < 50) return;
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