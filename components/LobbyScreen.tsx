import React from 'react';
import { Copy, Play, User as UserIcon, Loader2 } from 'lucide-react';
import { User } from '../types';

interface LobbyScreenProps {
  roomId: string;
  users: User[];
  isHost: boolean;
  onStart: () => void;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({ roomId, users, isHost, onStart }) => {
  const [copied, setCopied] = React.useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4 relative">
       <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px]" />
       </div>

       <div className="z-10 w-full max-w-2xl">
         <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl">
           
           <div className="text-center mb-8">
             <h2 className="text-3xl font-bold text-white mb-2">Комната ожидания</h2>
             <p className="text-slate-400">Поделитесь ID комнаты с друзьями, чтобы начать</p>
           </div>

           {/* Room ID Card */}
           <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700/50 flex flex-col items-center gap-4">
             <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">ID Вашей Комнаты</span>
             <div className="flex items-center gap-3 w-full max-w-sm">
                <div className="flex-1 bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-center text-2xl font-mono text-indigo-400 tracking-widest shadow-inner">
                  {roomId}
                </div>
                <button 
                  onClick={copyId}
                  className="p-3.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors relative"
                  title="Copy ID"
                >
                  {copied ? <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-green-500 text-white px-2 py-1 rounded">Скопировано!</span> : null}
                  <Copy className="w-5 h-5" />
                </button>
             </div>
           </div>

           {/* User List */}
           <div className="mb-8">
             <div className="flex items-center justify-between mb-4 px-2">
               <h3 className="text-white font-semibold flex items-center gap-2">
                 <UserIcon className="w-5 h-5 text-slate-400" />
                 Участники ({users.length})
               </h3>
               {users.length < 2 && (
                 <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
                   Ждем игроков...
                 </span>
               )}
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
               {users.map((user) => (
                 <div key={user.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl border border-slate-700/50">
                   <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg"
                    style={{ backgroundColor: user.color }}
                   >
                     {user.username.charAt(0).toUpperCase()}
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-white font-medium truncate">{user.username}</p>
                     <p className="text-xs text-slate-400">{user.isHost ? 'Хост' : 'Участник'}</p>
                   </div>
                 </div>
               ))}
               {/* Placeholders to show empty slots feeling */}
               {[...Array(Math.max(0, 4 - users.length))].map((_, i) => (
                 <div key={`placeholder-${i}`} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl border border-slate-800/50 border-dashed">
                   <div className="w-10 h-10 rounded-full bg-slate-800/50 animate-pulse" />
                   <div className="h-4 w-24 bg-slate-800/50 rounded animate-pulse" />
                 </div>
               ))}
             </div>
           </div>

           {/* Action Buttons */}
           <div className="flex justify-center">
             {isHost ? (
               <button
                 onClick={onStart}
                 disabled={users.length < 1} // Allowed to start alone for testing, usually < 2
                 className="group relative flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-12 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
               >
                 <Play className="w-6 h-6 fill-current" />
                 Начать
               </button>
             ) : (
               <div className="flex items-center gap-3 text-slate-400 bg-slate-900/50 py-3 px-6 rounded-xl border border-slate-800">
                 <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                 Ожидание хоста...
               </div>
             )}
           </div>
         </div>
       </div>
    </div>
  );
};

export default LobbyScreen;