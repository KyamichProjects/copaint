import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { socketService } from '../services/socketService';
import { DrawLine, Point, CursorPosition, User, Tool, DrawShape, FillAction, ChatMessage, CanvasAction, DrawStroke } from '../types';
import { 
  MousePointer2, Eraser, Download, ArrowLeft, Palette, 
  Minus, Plus, PaintBucket, Brush, Pencil, 
  Square, Circle, Triangle, Pipette, MessageSquare, LogOut, X, Send,
  Undo2, Redo2, Trash2, Sparkles, Loader2
} from 'lucide-react';

interface PaintCanvasProps {
  roomId: string;
  currentUser: User;
  onExit: () => void;
}

const PaintCanvas: React.FC<PaintCanvasProps> = ({ roomId, currentUser, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState<string>(currentUser.color || '#000000');
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [activeCursorIds, setActiveCursorIds] = useState<string[]>([]);
  
  // History State
  const [history, setHistory] = useState<CanvasAction[]>([]);
  
  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AI State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Optimized cursor refs
  const cursorDataRef = useRef<Record<string, CursorPosition>>({});
  const cursorElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  
  const startPoint = useRef<Point | null>(null); 
  const lastPoint = useRef<Point | null>(null); 
  
  // Current stroke points for history
  const currentStrokePoints = useRef<Point[]>([]);

  // --- Drawing Helpers ---

  // Draws a simple segment (used for real-time ephemeral drawing)
  const drawLineSegment = useCallback((data: DrawLine) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { prevPoint, currentPoint, color, width } = data;
    
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    if (prevPoint) {
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
    }
  }, []);

  // Draws a complete stroke from history
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, data: DrawStroke) => {
    if (data.points.length < 2) return;
    
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.width;
    
    ctx.moveTo(data.points[0].x, data.points[0].y);
    for (let i = 1; i < data.points.length; i++) {
        ctx.lineTo(data.points[i].x, data.points[i].y);
    }
    ctx.stroke();
  }, []);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, data: DrawShape) => {
    const { startPoint, endPoint, color, width, type } = data;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();

    const w = endPoint.x - startPoint.x;
    const h = endPoint.y - startPoint.y;

    if (type === 'rect') {
        ctx.strokeRect(startPoint.x, startPoint.y, w, h);
    } else if (type === 'circle') {
        const radius = Math.sqrt(w*w + h*h);
        ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (type === 'triangle') {
        ctx.moveTo(startPoint.x + w/2, startPoint.y); // Top
        ctx.lineTo(startPoint.x, startPoint.y + h); // Bottom Left
        ctx.lineTo(startPoint.x + w, startPoint.y + h); // Bottom Right
        ctx.closePath();
        ctx.stroke();
    }
  }, []);

  const floodFill = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: string) => {
    // Convert hex fillColor to RGBA
    const div = document.createElement('div');
    div.style.color = fillColor;
    document.body.appendChild(div);
    const rgbaStr = window.getComputedStyle(div).color;
    document.body.removeChild(div);
    const rgba = rgbaStr.match(/\d+/g)?.map(Number);
    if (!rgba) return;
    const [fillR, fillG, fillB] = rgba;
    const fillA = 255;

    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    
    const stack = [[Math.floor(x), Math.floor(y)]];
    const startPos = (Math.floor(y) * ctx.canvas.width + Math.floor(x)) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    // Tolerance check or same color check
    if (fillR === startR && fillG === startG && fillB === startB && fillA === startA) return;

    while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const pos = (cy * ctx.canvas.width + cx) * 4;

        if (cx < 0 || cx >= ctx.canvas.width || cy < 0 || cy >= ctx.canvas.height) continue;

        if (data[pos] === startR && data[pos + 1] === startG && data[pos + 2] === startB && data[pos + 3] === startA) {
            data[pos] = fillR;
            data[pos + 1] = fillG;
            data[pos + 2] = fillB;
            data[pos + 3] = fillA;

            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  // --- Redraw Logic (The Core of Undo/Redo) ---
  
  const redrawCanvas = useCallback((actions: CanvasAction[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear everything
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Replay history
      actions.forEach(action => {
          if (action.type === 'clear') {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              return; 
          }
          
          if (!action.data) return;
          
          switch (action.type) {
              case 'stroke':
                  drawStroke(ctx, action.data as DrawStroke);
                  break;
              case 'shape':
                  drawShape(ctx, action.data as DrawShape);
                  break;
              case 'fill':
                  const fillData = action.data as FillAction;
                  floodFill(ctx, fillData.point.x, fillData.point.y, fillData.color);
                  break;
          }
      });
  }, [drawStroke, drawShape, floodFill]);

  // --- Socket Listeners ---

  useEffect(() => {
    // Ephemeral drawing (lines from other users appear instantly)
    const handleRemoteDrawLine = (data: DrawLine) => drawLineSegment(data);
    
    // History Events
    const handleHistoryAction = (action: CanvasAction) => {
        setHistory(prev => {
            const newHistory = [...prev, action];
            
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                 if (action.type === 'shape' && action.data) drawShape(ctx, action.data as DrawShape);
                 if (action.type === 'fill' && action.data) {
                     const d = action.data as FillAction;
                     floodFill(ctx, d.point.x, d.point.y, d.color);
                 }
                 if (action.type === 'clear') ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                 
                 // If it is a stroke from another user that we haven't drawn fully yet (or to reinforce lines)
                 if (action.type === 'stroke' && action.data && action.userId !== socketService.currentUserId) {
                     drawStroke(ctx, action.data as DrawStroke);
                 }
            }
            return newHistory;
        });
    };

    const handleHistorySync = (fullHistory: CanvasAction[]) => {
        setHistory(fullHistory);
        redrawCanvas(fullHistory);
    };

    const handleRemoteCursor = (data: CursorPosition) => {
      if (data.userId === socketService.currentUserId) return;
      cursorDataRef.current[data.userId] = data;
      const el = cursorElementsRef.current[data.userId];
      if (el) {
          el.style.transform = `translate(${data.x}px, ${data.y}px)`;
      } else {
          setActiveCursorIds(prev => prev.includes(data.userId) ? prev : [...prev, data.userId]);
      }
    };
    
    // cleanup cursor if user leaves
    const handleUserLeft = ({ userId }: { userId: string }) => {
        setActiveCursorIds(prev => prev.filter(id => id !== userId));
        delete cursorDataRef.current[userId];
        const el = cursorElementsRef.current[userId];
        if (el) {
            // React handles removing the element via activeCursorIds map, but we clean up ref just in case
            cursorElementsRef.current[userId] = null; 
        }
    };

    const handleChatMessage = (msg: ChatMessage) => {
        setChatMessages(prev => [...prev, msg]);
        if (chatEndRef.current) {
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    socketService.on('draw_line', handleRemoteDrawLine);
    socketService.on('history_action', handleHistoryAction);
    socketService.on('history_sync', handleHistorySync);
    socketService.on('cursor_move', handleRemoteCursor);
    socketService.on('user_left', handleUserLeft);
    socketService.on('chat_message', handleChatMessage);

    return () => {
      socketService.off('draw_line', handleRemoteDrawLine);
      socketService.off('history_action', handleHistoryAction);
      socketService.off('history_sync', handleHistorySync);
      socketService.off('cursor_move', handleRemoteCursor);
      socketService.off('user_left', handleUserLeft);
      socketService.off('chat_message', handleChatMessage);
    };
  }, [drawLineSegment, drawShape, floodFill, redrawCanvas, drawStroke]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) {
                  socketService.emitRedo(roomId);
              } else {
                  socketService.emitUndo(roomId);
              }
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              socketService.emitRedo(roomId);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomId]);

  // --- Sizing Logic ---
  const syncCanvasSize = () => {
    if (canvasRef.current && containerRef.current && previewCanvasRef.current) {
        const parent = containerRef.current;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        
        [canvasRef.current, previewCanvasRef.current].forEach(canvas => {
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
        });
        // After resize, must redraw from history
        redrawCanvas(history);
    }
  };

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    setTimeout(syncCanvasSize, 10);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [history, redrawCanvas]);

  // --- Interaction Handlers (Mouse & Touch) ---

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    
    // Prevent scrolling on touch
    if ('touches' in e) {
        // e.preventDefault() cannot be called on passive listener, usually React handles this well,
        // but adding touch-action: none in CSS is better.
    }

    setIsDrawing(true);
    const { x, y } = getPointerPos(e);
    
    startPoint.current = { x, y };
    lastPoint.current = { x, y };
    currentStrokePoints.current = [{x, y}];

    if (tool === 'fill') {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) floodFill(ctx, x, y, color);
        const action: CanvasAction = {
            id: Math.random().toString(36),
            type: 'fill',
            userId: socketService.currentUserId,
            timestamp: Date.now(),
            data: { point: { x, y }, color }
        };
        socketService.emitFill(roomId, action);
        setIsDrawing(false); 
    } else if (tool === 'picker') {
        const ctx = canvasRef.current.getContext('2d');
        const p = ctx?.getImageData(x, y, 1, 1).data;
        if (p) {
            const hex = "#" + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
            setColor(hex);
            setTool('brush'); 
        }
        setIsDrawing(false);
    }
  };

  const moveDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    const { x, y } = getPointerPos(e);
    const currentPoint = { x, y };

    socketService.emitCursor(roomId, {
      userId: socketService.currentUserId,
      x: x,
      y: y,
      color: currentUser.color,
      username: currentUser.username
    });

    if (!isDrawing || !startPoint.current) return;

    if (['rect', 'circle', 'triangle'].includes(tool)) {
        const ctx = previewCanvasRef.current?.getContext('2d');
        if (ctx && previewCanvasRef.current) {
            ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
            drawShape(ctx, {
                type: tool as any,
                startPoint: startPoint.current,
                endPoint: currentPoint,
                color: color,
                width: lineWidth,
                isFilled: false
            });
        }
    } else if (['brush', 'pencil', 'eraser'].includes(tool)) {
        const effectiveColor = tool === 'eraser' ? '#FFFFFF' : color;
        const effectiveWidth = tool === 'pencil' ? 1 : lineWidth;
        
        const data: DrawLine = {
            prevPoint: lastPoint.current || currentPoint,
            currentPoint,
            color: effectiveColor,
            width: effectiveWidth
        };
        drawLineSegment(data);
        socketService.emitDrawLine(roomId, data);
        
        lastPoint.current = currentPoint;
        currentStrokePoints.current.push(currentPoint);
    }
  };

  const endDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !startPoint.current) return;
    
    // For touch end, we might need changedTouches if we needed the position, 
    // but here we just use the last known position or just finish.
    // However, DrawShape needs endPoint. We use lastPoint for that.
    const endPoint = lastPoint.current || startPoint.current;

    if (['rect', 'circle', 'triangle'].includes(tool)) {
        const ctx = canvasRef.current?.getContext('2d');
        const shapeData: DrawShape = {
            type: tool as any,
            startPoint: startPoint.current,
            endPoint: endPoint,
            color: color,
            width: lineWidth,
            isFilled: false
        };
        if (ctx) drawShape(ctx, shapeData);
        
        const action: CanvasAction = {
            id: Math.random().toString(36),
            type: 'shape',
            userId: socketService.currentUserId,
            timestamp: Date.now(),
            data: shapeData
        };
        socketService.emitShape(roomId, action);
        
        const pCtx = previewCanvasRef.current?.getContext('2d');
        pCtx?.clearRect(0, 0, previewCanvasRef.current!.width, previewCanvasRef.current!.height);
    } 
    else if (['brush', 'pencil', 'eraser'].includes(tool)) {
        const effectiveColor = tool === 'eraser' ? '#FFFFFF' : color;
        const effectiveWidth = tool === 'pencil' ? 1 : lineWidth;
        
        const strokeData: DrawStroke = {
            points: currentStrokePoints.current,
            color: effectiveColor,
            width: effectiveWidth,
            tool: tool as 'brush' | 'pencil' | 'eraser'
        };

        const action: CanvasAction = {
            id: Math.random().toString(36),
            type: 'stroke',
            userId: socketService.currentUserId,
            timestamp: Date.now(),
            data: strokeData
        };
        socketService.emitStroke(roomId, action);
    }

    setIsDrawing(false);
    startPoint.current = null;
    lastPoint.current = null;
    currentStrokePoints.current = [];
  };

  const handleClear = () => {
     const action: CanvasAction = {
        id: Math.random().toString(36),
        type: 'clear',
        userId: socketService.currentUserId,
        timestamp: Date.now(),
        data: null
     };
     socketService.emitClear(roomId, action);
  };

  // --- AI Generation Logic ---
  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsGeneratingAI(true);
    
    // Calculate center of canvas for better placement if needed, or just use 0-800 space
    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const promptText = `
          You are a vector drawing assistant.
          Task: Create a simple drawing of: "${aiPrompt}".
          Constraints:
          - Use coordinates between 0 and ${w} for x, and 0 and ${h} for y.
          - Keep the number of points reasonable (e.g., 20-50 per stroke).
          - Use vivid colors.
          - The drawing should be centered.
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  width: { type: Type.NUMBER },
                  points: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        const textResponse = response.text;
        
        if (textResponse) {
            const strokes = JSON.parse(textResponse);

            if (Array.isArray(strokes)) {
                strokes.forEach((s: any) => {
                     if (s.points && Array.isArray(s.points)) {
                         const strokeData: DrawStroke = {
                             points: s.points,
                             color: s.color || '#000000',
                             width: s.width || 2,
                             tool: 'brush'
                         };
                         
                         const action: CanvasAction = {
                            id: Math.random().toString(36),
                            type: 'stroke',
                            userId: socketService.currentUserId,
                            timestamp: Date.now(),
                            data: strokeData
                        };
                        
                        socketService.emitStroke(roomId, action);
                     }
                });
            }
        }
        setIsAIModalOpen(false);
        setAiPrompt('');
    } catch (error) {
        console.error("AI Generation Error:", error);
        alert("Failed to generate drawing. Please try again.");
    } finally {
        setIsGeneratingAI(false);
    }
  };

  // --- Chat Logic ---
  const sendMessage = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim()) return;

      const msg: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          userId: socketService.currentUserId,
          username: currentUser.username,
          text: newMessage,
          timestamp: Date.now(),
          color: currentUser.color
      };
      
      socketService.emitChatMessage(roomId, msg);
      setNewMessage('');
  };

  const downloadCanvas = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `copaint-${roomId}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden relative" ref={containerRef}>
      
      {/* --- Top Bar --- */}
      <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-2 sm:px-4 z-50 shadow-md">
        <div className="flex items-center gap-2 sm:gap-4">
             <span className="text-indigo-400 font-bold text-lg sm:text-xl tracking-tight">CoPaint</span>
             <div className="h-6 w-px bg-slate-700 mx-2 hidden sm:block"></div>
             
             {/* Undo / Redo / AI Buttons */}
             <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
                 <button 
                    onClick={() => socketService.emitUndo(roomId)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                    title="Undo (Ctrl+Z)"
                 >
                     <Undo2 className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={() => socketService.emitRedo(roomId)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                    title="Redo (Ctrl+Y)"
                 >
                     <Redo2 className="w-4 h-4" />
                 </button>
                 <div className="w-px h-4 bg-slate-700 mx-1"></div>
                 <button 
                    onClick={() => setIsAIModalOpen(true)}
                    className="p-1.5 text-purple-400 hover:text-white hover:bg-purple-600 rounded-md transition-colors flex items-center gap-1"
                    title="Generate with AI"
                 >
                     <Sparkles className="w-4 h-4" />
                 </button>
             </div>

             <div className="hidden sm:flex items-center gap-3">
                 <div className="text-xs text-slate-400">
                    ID: <span className="font-mono text-slate-200 bg-slate-700 px-2 py-0.5 rounded">{roomId}</span>
                 </div>
             </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 bg-slate-900/50 px-2 sm:px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: currentUser.color, color: currentUser.color }}></div>
                <span className="text-sm font-medium text-slate-200 max-w-[60px] sm:max-w-[100px] truncate">{currentUser.username}</span>
            </div>
            
            <button 
                onClick={downloadCanvas}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors hidden sm:block"
                title="Save Image"
            >
                <Download className="w-5 h-5" />
            </button>
            
            <button 
                onClick={onExit}
                className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-2 sm:px-3 py-1.5 rounded-lg border border-red-500/20 transition-all font-medium text-sm"
            >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Exit</span>
            </button>
        </div>
      </div>

      {/* --- Main Workspace --- */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 bg-white"
          />
          <canvas
            ref={previewCanvasRef}
            onMouseDown={startDrawing}
            onMouseMove={moveDrawing}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={moveDrawing}
            onTouchEnd={endDrawing}
            className={`absolute inset-0 touch-none z-10 ${tool === 'brush' || tool === 'pencil' ? 'cursor-crosshair' : 'cursor-default'}`}
          />

          {/* AI Prompt Modal */}
          {isAIModalOpen && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 w-80 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-3">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-400" /> 
                          AI Drawing
                      </h3>
                      <button onClick={() => setIsAIModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                  <form onSubmit={handleGenerateAI} className="space-y-3">
                      <textarea
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="Describe what to draw (e.g., 'a cute cat', 'a red car')..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none resize-none h-24"
                          autoFocus
                      />
                      <button 
                        type="submit" 
                        disabled={isGeneratingAI}
                        className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                      >
                          {isGeneratingAI ? <><Loader2 className="w-4 h-4 animate-spin"/> Drawing...</> : 'Generate'}
                      </button>
                  </form>
              </div>
          )}

          {/* Remote Cursors */}
          {activeCursorIds.map((userId) => {
             const data = cursorDataRef.current[userId];
             if (!data) return null;
             return (
                <div
                  key={userId}
                  ref={(el) => { cursorElementsRef.current[userId] = el; }}
                  className="absolute pointer-events-none transition-transform duration-75 ease-linear z-20"
                  style={{ transform: `translate(${data.x}px, ${data.y}px)` }}
                >
                  <MousePointer2 className="w-5 h-5 drop-shadow-md" style={{ fill: data.color, color: data.color }} />
                  <span className="absolute left-4 top-2 px-2 py-0.5 rounded text-xs text-white font-medium whitespace-nowrap shadow-sm cursor-label" style={{ backgroundColor: data.color }}>
                    {data.username}
                  </span>
                </div>
             );
          })}
      </div>

      {/* --- Chat Overlay --- */}
      <div className={`absolute right-4 bottom-20 z-40 transition-all duration-300 transform ${isChatOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'}`}>
          <div className="w-80 h-96 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                  <span className="text-white font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4"/> Chat</span>
                  <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-800/95">
                  {chatMessages.map((msg) => (
                      <div key={msg.id} className="flex flex-col">
                          <div className="flex items-baseline gap-2">
                              <span className="text-xs font-bold" style={{ color: msg.color }}>{msg.username}:</span>
                              <span className="text-slate-400 text-[10px]">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <p className="text-slate-200 text-sm break-words leading-relaxed">{msg.text}</p>
                      </div>
                  ))}
                  {chatMessages.length === 0 && (
                      <div className="text-center text-slate-500 text-sm mt-10 italic">Нет сообщений...</div>
                  )}
                  <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendMessage} className="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                  <input 
                    className="flex-1 bg-slate-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 border border-slate-700"
                    placeholder="Камиль: привет..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <button type="submit" className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                      <Send className="w-4 h-4" />
                  </button>
              </form>
          </div>
      </div>

      {/* --- Chat Toggle Button --- */}
      {!isChatOpen && (
          <button 
            onClick={() => { setIsChatOpen(true); setTimeout(() => chatEndRef.current?.scrollIntoView(), 100); }}
            className="absolute right-4 bottom-24 z-30 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full shadow-lg shadow-indigo-600/30 transition-transform hover:scale-105"
          >
            <MessageSquare className="w-6 h-6" />
          </button>
      )}

      {/* --- Bottom Toolbar --- */}
      <div className="h-16 bg-slate-900 border-t border-slate-700 flex items-center gap-2 px-2 z-50 overflow-x-auto sm:justify-center sm:gap-6 sm:px-4 no-scrollbar">
        
        {/* Color Picker */}
        <div className="flex items-center gap-2 mr-2 flex-shrink-0">
             <label className="relative cursor-pointer w-10 h-10 rounded-full border-2 border-slate-500 overflow-hidden hover:scale-105 transition-transform flex-shrink-0">
                <input 
                    type="color" 
                    value={color} 
                    onChange={(e) => { setColor(e.target.value); setTool('brush'); }}
                    className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer"
                />
             </label>
        </div>
        
        <div className="w-px h-10 bg-slate-700 hidden sm:block flex-shrink-0"></div>

        {/* Tools */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {[
                { id: 'brush', icon: Brush, label: 'Brush' },
                { id: 'pencil', icon: Pencil, label: 'Pencil' },
                { id: 'eraser', icon: Eraser, label: 'Eraser' },
                { id: 'fill', icon: PaintBucket, label: 'Fill' },
                { id: 'picker', icon: Pipette, label: 'Pipette' },
            ].map((t) => (
                <button 
                    key={t.id}
                    onClick={() => setTool(t.id as Tool)}
                    className={`p-2.5 rounded-xl transition-all ${tool === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    title={t.label}
                >
                    <t.icon className="w-5 h-5" />
                </button>
            ))}
            <button 
                 onClick={handleClear}
                 className="p-2.5 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/50 transition-all"
                 title="Clear Canvas"
            >
                <Trash2 className="w-5 h-5" />
            </button>
        </div>

        <div className="w-px h-10 bg-slate-700 hidden sm:block flex-shrink-0"></div>

        {/* Shapes */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {[
                { id: 'rect', icon: Square, label: 'Rectangle' },
                { id: 'circle', icon: Circle, label: 'Circle' },
                { id: 'triangle', icon: Triangle, label: 'Triangle' },
            ].map((t) => (
                <button 
                    key={t.id}
                    onClick={() => setTool(t.id as Tool)}
                    className={`p-2.5 rounded-xl transition-all ${tool === t.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    title={t.label}
                >
                    <t.icon className="w-5 h-5" />
                </button>
            ))}
        </div>

        <div className="w-px h-10 bg-slate-700 hidden sm:block flex-shrink-0"></div>

        {/* Size */}
        <div className="hidden md:flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 flex-shrink-0">
            <button onClick={() => setLineWidth(Math.max(1, lineWidth - 2))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"><Minus className="w-3 h-3" /></button>
            <span className="w-8 text-center text-sm font-mono text-slate-300 select-none">{lineWidth}</span>
            <button onClick={() => setLineWidth(Math.min(50, lineWidth + 2))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"><Plus className="w-3 h-3" /></button>
        </div>

      </div>
    </div>
  );
};

export default PaintCanvas;