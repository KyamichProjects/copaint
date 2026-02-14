export enum AppState {
  WELCOME = 'WELCOME',
  LOBBY = 'LOBBY',
  CANVAS = 'CANVAS',
}

export type Tool = 'brush' | 'pencil' | 'eraser' | 'fill' | 'rect' | 'circle' | 'triangle' | 'picker';

export interface Point {
  x: number;
  y: number;
}

export interface DrawLine {
  prevPoint: Point | null;
  currentPoint: Point;
  color: string;
  width: number;
}

export interface DrawStroke {
  points: Point[];
  color: string;
  width: number;
  tool: 'brush' | 'pencil' | 'eraser';
}

export interface DrawShape {
  type: 'rect' | 'circle' | 'triangle';
  startPoint: Point;
  endPoint: Point;
  color: string;
  width: number;
  isFilled: boolean; 
}

export interface FillAction {
  point: Point;
  color: string;
}

export type ActionType = 'stroke' | 'shape' | 'fill' | 'clear';

export interface CanvasAction {
  id: string;
  type: ActionType;
  data: DrawStroke | DrawShape | FillAction | null;
  userId: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  color: string;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  username?: string;
  color: string;
}

export interface User {
  id: string;
  username: string;
  isHost: boolean;
  color: string;
}

export interface RoomData {
  roomId: string;
  users: User[];
}

export const USER_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', 
  '#22d3ee', '#818cf8', '#c084fc', '#f472b6'
];

export const getRandomColor = () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];