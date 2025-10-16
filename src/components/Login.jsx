import { useState } from "react";
import axios from "axios";

const API = "http://10.11.40.32:3000";

export default function Login({ setToken, setUsername }) {
  // 状态管理
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [isLoginActive, setIsLoginActive] = useState(true);
  const [loading, setLoading] = useState({ login: false, register: false });

  // 注册处理函数
  const register = async () => {
    if (!regUser.trim() || !regPass.trim()) {
      alert("请输入用户名和密码");
      return;
    }
    
    setLoading(prev => ({ ...prev, register: true }));
    try {
      const res = await axios.post(`${API}/register`, {
        username: regUser,
        password: regPass,
      });
      alert(res.data.message || "注册成功，请登录");
      setRegUser("");
      setRegPass("");
      setIsLoginActive(true);
    } catch (err) {
      alert(err.response?.data?.message || "注册失败，请重试");
    } finally {
      setLoading(prev => ({ ...prev, register: false }));
    }
  };

  // 登录处理函数
  // 登录处理函数（修改后）
const login = async () => {
  if (!loginUser.trim() || !loginPass.trim()) {
    alert("请输入用户名和密码");
    return;
  }
  
  setLoading(prev => ({ ...prev, login: true }));
  try {
    const res = await axios.post(`${API}/login`, {
      username: loginUser,
      password: loginPass,
    });
    if (res.data.token) {
      // 1. 存储 token 到 LocalStorage（持久化，关闭浏览器也保留）
      localStorage.setItem('chatAuthToken', res.data.token);
      // 2. 存储用户名（可选，避免重复传递）
      localStorage.setItem('chatUsername', loginUser);
      // 3. 同步到父组件状态
      setToken(res.data.token);
      setUsername(loginUser);
      alert("登录成功");
    } else {
      alert("登录失败，用户名或密码错误");
    }
  } catch (err) {
    alert(err.response?.data?.message || "登录失败，请重试");
  } finally {
    setLoading(prev => ({ ...prev, login: false }));
  }
};


  // 键盘回车提交
  const handleKeyPress = (e, type) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      type === 'login' ? login() : register();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      boxSizing: 'border-box',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'white',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden'
      }}>
        {/* 标题区域 */}
        <div style={{
          padding: '25px',
          textAlign: 'center',
          background: '#2c3e50',
          color: 'white'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: '600'
          }}>聊天室登录</h1>
          <p style={{
            margin: '8px 0 0 0',
            fontSize: '14px',
            opacity: 0.9
          }}>连接朋友，畅所欲言</p>
        </div>

        {/* 切换标签 */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #eee'
        }}>
          <button
            onClick={() => setIsLoginActive(true)}
            style={{
              flex: 1,
              padding: '15px',
              border: 'none',
              background: 'transparent',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              color: isLoginActive ? '#2c3e50' : '#7f8c8d',
              borderBottom: isLoginActive ? '2px solid #2c3e50' : 'none'
            }}
          >
            登录
          </button>
          <button
            onClick={() => setIsLoginActive(false)}
            style={{
              flex: 1,
              padding: '15px',
              border: 'none',
              background: 'transparent',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              color: !isLoginActive ? '#2c3e50' : '#7f8c8d',
              borderBottom: !isLoginActive ? '2px solid #2c3e50' : 'none'
            }}
          >
            注册
          </button>
        </div>

        {/* 表单内容 */}
        <div style={{
          padding: '25px',
          boxSizing: 'border-box'
        }}>
          {/* 登录表单 */}
          {isLoginActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  color: '#34495e',
                  fontWeight: '500'
                }}>用户名</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#95a5a6'
                  }}>👤</span>
                  <input
                    type="text"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, 'login')}
                    placeholder="请输入用户名"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 40px',
                      border: '1px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '16px',
                      boxSizing: 'border-box',
                      transition: 'border 0.3s'
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid #3498db'}
                    onBlur={(e) => e.target.style.border = '1px solid #bdc3c7'}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  color: '#34495e',
                  fontWeight: '500'
                }}>密码</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#95a5a6'
                  }}>🔒</span>
                  <input
                    type="password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, 'login')}
                    placeholder="请输入密码"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 40px',
                      border: '1px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '16px',
                      boxSizing: 'border-box',
                      transition: 'border 0.3s'
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid #3498db'}
                    onBlur={(e) => e.target.style.border = '1px solid #bdc3c7'}
                  />
                </div>
              </div>

              <button
                onClick={login}
                disabled={loading.login}
                style={{
                  padding: '12px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background 0.3s',
                  opacity: loading.login ? 0.8 : 1
                }}
                onMouseOver={(e) => !loading.login && (e.target.style.backgroundColor = '#2980b9')}
                onMouseOut={(e) => !loading.login && (e.target.style.backgroundColor = '#3498db')}
              >
                {loading.login ? '登录中...' : '登录'}
              </button>
            </div>
          )}

          {/* 注册表单 */}
          {!isLoginActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  color: '#34495e',
                  fontWeight: '500'
                }}>用户名</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#95a5a6'
                  }}>👤</span>
                  <input
                    type="text"
                    value={regUser}
                    onChange={(e) => setRegUser(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, 'register')}
                    placeholder="请设置用户名"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 40px',
                      border: '1px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '16px',
                      boxSizing: 'border-box',
                      transition: 'border 0.3s'
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid #3498db'}
                    onBlur={(e) => e.target.style.border = '1px solid #bdc3c7'}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  color: '#34495e',
                  fontWeight: '500'
                }}>密码</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#95a5a6'
                  }}>🔒</span>
                  <input
                    type="password"
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, 'register')}
                    placeholder="请设置密码"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 40px',
                      border: '1px solid #bdc3c7',
                      borderRadius: '5px',
                      fontSize: '16px',
                      boxSizing: 'border-box',
                      transition: 'border 0.3s'
                    }}
                    onFocus={(e) => e.target.style.border = '1px solid #3498db'}
                    onBlur={(e) => e.target.style.border = '1px solid #bdc3c7'}
                  />
                </div>
              </div>

              <button
                onClick={register}
                disabled={loading.register}
                style={{
                  padding: '12px',
                  backgroundColor: '#2ecc71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background 0.3s',
                  opacity: loading.register ? 0.8 : 1
                }}
                onMouseOver={(e) => !loading.register && (e.target.style.backgroundColor = '#27ae60')}
                onMouseOut={(e) => !loading.register && (e.target.style.backgroundColor = '#2ecc71')}
              >
                {loading.register ? '注册中...' : '注册'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
    