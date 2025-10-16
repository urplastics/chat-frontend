// App.jsx（示例代码）
import { useState, useEffect } from "react";
import Login from './components/Login';
import Chat from "./components/Chat";

function App() {
  // 1. 初始化状态：优先从 LocalStorage 读取，没有则为空
  const [token, setToken] = useState(localStorage.getItem('chatAuthToken') || '');
  const [username, setUsername] = useState(localStorage.getItem('chatUsername') || '');

  // 2. 退出登录：清除状态和存储的 token
  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('chatAuthToken'); // 清除存储
    localStorage.removeItem('chatUsername');
  };

  return (
    <div className="App">
      {/* 3. 根据 token 是否存在，显示 Login 或 Chat */}
      {token ? (
        <Chat 
          token={token} 
          username={username} 
          onLogout={handleLogout} 
        />
      ) : (
        <Login 
          setToken={setToken} 
          setUsername={setUsername} 
        />
      )}
    </div>
  );
}

export default App;