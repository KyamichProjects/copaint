import React, { useRef, useEffect, useState, useCallback } from 'react';
import { socketService } from '../services/socketService';
import { DrawLine, Point, CursorPosition, User, Tool, DrawShape, FillAction, DrawText, ChatMessage } from '../types';
import { 
  MousePointer2, Eraser, Download, ArrowLeft, Palette, 
  Minus, Plus, PaintBucket, Brush, Pencil, 
  Square, Circle, Triangle, Pipette, Type, MessageSquare, LogOut, X, Send
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
  const textInputRef = useRef<HTMLInputElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState<string>(currentUser.color || '#000000');
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [activeCursorIds, setActiveCursorIds] = useState<string[]>([]);
  
  // Text Tool State
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Optimized cursor refs
  const cursorDataRef = useRef<Record<string, CursorPosition>>({});
  const cursorElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  
  const startPoint = useRef<Point | null>(null); 
  const lastPoint = useRef<Point | null>(null); 

  // --- Drawing Helpers ---

  const drawLine = useCallback((data: DrawLine) => {
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

  const drawText = useCallback((data: DrawText) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.font = `${data.fontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = data.color;
      ctx.fillText(data.text, data.point.x, data.point.y);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const floodFill = useCallback((x: number, y: number, fillColor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const stack = [[Math.floor(x), Math.floor(y)]];
    const startPos = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    // Tolerance check
    if (fillR === startR && fillG === startG && fillB === startB && fillA === startA) return;

    while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const pos = (cy * canvas.width + cx) * 4;

        if (cx < 0 || cx >= canvas.width || cy < 0 || cy >= canvas.height) continue;

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

  // --- Socket Logic ---

  useEffect(() => {
    const handleRemoteDraw = (data: DrawLine) => drawLine(data);
    const handleRemoteShape = (data: DrawShape) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) drawShape(ctx, data);
    };
    const handleRemoteText = (data: DrawText) => drawText(data);
    const handleRemoteFill = (data: FillAction) => floodFill(data.point.x, data.point.y, data.color);
    const handleRemoteClear = () => clearCanvas();
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
    const handleChatMessage = (msg: ChatMessage) => {
        setChatMessages(prev => [...prev, msg]);
        // Auto scroll if open
        if (chatEndRef.current) {
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    socketService.on('draw_line', handleRemoteDraw);
    socketService.on('draw_shape', handleRemoteShape);
    socketService.on('draw_text', handleRemoteText);
    socketService.on('fill_canvas', handleRemoteFill);
    socketService.on('clear_canvas', handleRemoteClear);
    socketService.on('cursor_move', handleRemoteCursor);
    socketService.on('chat_message', handleChatMessage);

    return () => {
      socketService.off('draw_line', handleRemoteDraw);
      socketService.off('draw_shape', handleRemoteShape);
      socketService.off('draw_text', handleRemoteText);
      socketService.off('fill_canvas', handleRemoteFill);
      socketService.off('clear_canvas', handleRemoteClear);
      socketService.off('cursor_move', handleRemoteCursor);
      socketService.off('chat_message', handleChatMessage);
    };
  }, [drawLine, drawShape, drawText, floodFill, clearCanvas]);

  // --- Sizing Logic ---
  const syncCanvasSize = () => {
    if (canvasRef.current && containerRef.current && previewCanvasRef.current) {
        const parent = containerRef.current;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        
        [canvasRef.current, previewCanvasRef.current].forEach(canvas => {
            if (canvas.width !== width || canvas.height !== height) {
                // Save content for main canvas only
                if (canvas === canvasRef.current) {
                    const temp = document.createElement('canvas');
                    temp.width = canvas.width;
                    temp.height = canvas.height;
                    temp.getContext('2d')?.drawImage(canvas, 0, 0);
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d')?.drawImage(temp, 0, 0);
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }
            }
        });
    }
  };

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    setTimeout(syncCanvasSize, 10);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, []);

  // --- Interaction Handlers ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    // If text tool is active, don't draw lines, set input position
    if (tool === 'text') {
        const rect = canvasRef.current.getBoundingClientRect();
        setTextInputPos({ 
            x: e.clientX - rect.left, 
            y: e.clientY - rect.top 
        });
        setTimeout(() => textInputRef.current?.focus(), 10);
        return;
    }

    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    startPoint.current = { x, y };
    lastPoint.current = { x, y };

    if (tool === 'fill') {
        floodFill(x, y, color);
        socketService.emitFill(roomId, { point: { x, y }, color });
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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    socketService.emitCursor(roomId, {
      userId: socketService.currentUserId,
      x: currentPoint.x,
      y: currentPoint.y,
      color: currentUser.color,
      username: currentUser.username
    });

    if (!isDrawing || !startPoint.current) return;

    if (['rect', 'circle', 'triangle'].includes(tool)) {
        // Draw on preview canvas
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
        // Draw on main canvas
        const effectiveColor = tool === 'eraser' ? '#FFFFFF' : color;
        const effectiveWidth = tool === 'pencil' ? 1 : lineWidth;
        
        const data: DrawLine = {
            prevPoint: lastPoint.current || currentPoint,
            currentPoint,
            color: effectiveColor,
            width: effectiveWidth
        };
        drawLine(data);
        socketService.emitDraw(roomId, data);
        lastPoint.current = currentPoint;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const endPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

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
        socketService.emitShape(roomId, shapeData);
        
        const pCtx = previewCanvasRef.current?.getContext('2d');
        pCtx?.clearRect(0, 0, previewCanvasRef.current!.width, previewCanvasRef.current!.height);
    }

    setIsDrawing(false);
    startPoint.current = null;
    lastPoint.current = null;
  };

  // --- Text Input Handling ---
  const handleTextSubmit = (e: React.KeyboardEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
      if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !textInputPos || !textInputRef.current) return;

      const text = textInputRef.current.value;
      if (text.trim()) {
          const fontSize = Math.max(16, lineWidth * 4); // Scale font slightly with linewidth
          const textData: DrawText = {
              point: textInputPos,
              text: text,
              color: color,
              fontSize: fontSize
          };
          drawText(textData);
          socketService.emitText(roomId, textData);
      }
      
      setTextInputPos(null); // Remove input
      if (textInputRef.current) textInputRef.current.value = '';
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

      // Optimistic update handled by socket listener usually, but here we emit then wait for echo or add locally
      // Server broadcasts to everyone including sender usually in simple socket.io setups, but let's assume we need to add it ourselves or wait.
      // In this setup, server sends to room, sender is in room? Yes. 
      // But Socket.io usually excludes sender in broadcast. Let's check server code. 
      // Server code: io.to(roomId).emit. This INCLUDES sender.
      
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
      <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-50 shadow-md">
        <div className="flex items-center gap-4">
             <span className="text-indigo-400 font-bold text-xl tracking-tight">CoPaint</span>
             <div className="h-6 w-px bg-slate-700 mx-2 hidden sm:block"></div>
             <div className="hidden sm:flex items-center gap-3">
                 <div className="text-xs text-slate-400">
                    ID: <span className="font-mono text-slate-200 bg-slate-700 px-2 py-0.5 rounded">{roomId}</span>
                 </div>
             </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: currentUser.color, color: currentUser.color }}></div>
                <span className="text-sm font-medium text-slate-200 max-w-[100px] truncate">{currentUser.username}</span>
            </div>
            
            <button 
                onClick={downloadCanvas}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Save Image"
            >
                <Download className="w-5 h-5" />
            </button>
            
            <button 
                onClick={onExit}
                className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg border border-red-500/20 transition-all font-medium text-sm"
            >
                <LogOut className="w-4 h-4" />
                Exit
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
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`absolute inset-0 touch-none z-10 ${tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
          />

          {/* Text Input Overlay */}
          {textInputPos && (
              <input
                ref={textInputRef}
                type="text"
                className="absolute z-30 bg-transparent border-b-2 border-indigo-500 outline-none p-0 m-0 shadow-sm"
                style={{ 
                    left: textInputPos.x, 
                    top: textInputPos.y - (Math.max(16, lineWidth * 4) / 1.2), // Adjust for baseline
                    fontSize: `${Math.max(16, lineWidth * 4)}px`,
                    color: color,
                    fontFamily: 'Inter, sans-serif',
                    minWidth: '100px'
                }}
                onKeyDown={handleTextSubmit}
                onBlur={handleTextSubmit}
                placeholder="Type here..."
                autoFocus
              />
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
            {/* Notification dot could go here */}
          </button>
      )}

      {/* --- Bottom Toolbar --- */}
      <div className="h-16 bg-slate-900 border-t border-slate-700 flex items-center justify-center gap-6 px-4 z-50">
        
        {/* Color Picker */}
        <div className="flex items-center gap-2 mr-4 hidden sm:flex">
             <label className="relative cursor-pointer w-10 h-10 rounded-full border-2 border-slate-500 overflow-hidden hover:scale-105 transition-transform">
                <input 
                    type="color" 
                    value={color} 
                    onChange={(e) => { setColor(e.target.value); setTool('brush'); }}
                    className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer"
                />
             </label>
        </div>
        
        <div className="w-px h-10 bg-slate-700 hidden sm:block"></div>

        {/* Tools */}
        <div className="flex items-center gap-1 sm:gap-2">
            {[
                { id: 'brush', icon: Brush, label: 'Brush' },
                { id: 'pencil', icon: Pencil, label: 'Pencil' },
                { id: 'eraser', icon: Eraser, label: 'Eraser' },
                { id: 'text', icon: Type, label: 'Text' },
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
        </div>

        <div className="w-px h-10 bg-slate-700 hidden sm:block"></div>

        {/* Shapes */}
        <div className="flex items-center gap-1 sm:gap-2">
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

        <div className="w-px h-10 bg-slate-700 hidden sm:block"></div>

        {/* Size */}
        <div className="hidden md:flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button onClick={() => setLineWidth(Math.max(1, lineWidth - 2))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"><Minus className="w-3 h-3" /></button>
            <span className="w-8 text-center text-sm font-mono text-slate-300 select-none">{lineWidth}</span>
            <button onClick={() => setLineWidth(Math.min(50, lineWidth + 2))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded"><Plus className="w-3 h-3" /></button>
        </div>

      </div>
    </div>
  );
};

export default PaintCanvas;