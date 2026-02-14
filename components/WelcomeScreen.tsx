import React, { useState } from 'react';
import { PenTool, Users, LogIn, Plus } from 'lucide-react';

interface WelcomeScreenProps {
  onCreate: (username: string) => void;
  onJoin: (username: string, roomId: string) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onCreate, onJoin }) => {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'menu' | 'join' | 'create'>('menu');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) onCreate(username);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && roomId.trim()) onJoin(username, roomId);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Decorative Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="z-10 w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl shadow-xl shadow-indigo-500/20">
              <PenTool className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            CoPaint
          </h1>
          <p className="text-slate-400 text-lg">
            Рисуйте и творите вместе в реальном времени.
          </p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          {mode === 'menu' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('join')}
                className="group w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/50 rounded-xl transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 text-indigo-400 transition-colors">
                    <LogIn className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white text-lg">Присоединиться</div>
                    <div className="text-slate-400 text-sm">Ввести ID комнаты</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('create')}
                className="group w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500/50 rounded-xl transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 text-purple-400 transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white text-lg">Создать</div>
                    <div className="text-slate-400 text-sm">Начать новую сессию</div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {mode === 'join' && (
            <form onSubmit={handleJoin} className="space-y-6">
              <h2 className="text-xl font-semibold text-white">Присоединиться к холсту</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Ваше имя</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-white placeholder-slate-500 transition-all"
                    placeholder="Художник #1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">ID Комнаты</label>
                  <input
                    type="text"
                    required
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-white placeholder-slate-500 transition-all font-mono tracking-wider"
                    placeholder="ABCD-1234"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="flex-1 py-3 px-4 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors font-medium"
                >
                  Назад
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors font-medium shadow-lg shadow-indigo-600/20"
                >
                  Войти
                </button>
              </div>
            </form>
          )}

          {mode === 'create' && (
            <form onSubmit={handleCreate} className="space-y-6">
              <h2 className="text-xl font-semibold text-white">Создать новый холст</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Ваше имя</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-white placeholder-slate-500 transition-all"
                    placeholder="Мастер кисти"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="flex-1 py-3 px-4 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors font-medium"
                >
                  Назад
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-colors font-medium shadow-lg shadow-purple-600/20"
                >
                  Создать
                </button>
              </div>
            </form>
          )}
        </div>
        
        <p className="text-slate-600 text-sm text-center">
            {mode === 'join' ? "Введите ID, который вам дал друг." : mode === 'create' ? "Вы получите ID после создания." : "Лучше всего работает в Chrome/Firefox"}
        </p>
      </div>
    </div>
  );
};

export default WelcomeScreen;