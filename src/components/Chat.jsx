import { useEffect, useState, useRef } from "react";

export default function Chat({ token, username, onLogout }) {
  // 核心状态管理（所有钩子均在组件顶层）
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [users, setUsers] = useState([]); // 好友列表：{username: string, isOnline: boolean}
  const [groups, setGroups] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [activeChat, setActiveChat] = useState({ type: "group", name: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isTokenValid, setIsTokenValid] = useState(true);
  const [amIOnline, setAmIOnline] = useState(false); // 自身在线状态
  const [onlineStatusMap, setOnlineStatusMap] = useState({}); // 在线状态映射表
  const [hasAutoSelected, setHasAutoSelected] = useState(false); // 用于跟踪是否已自动选择群组

  // 群组功能相关状态
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinGroupParam, setJoinGroupParam] = useState({
    type: "name",
    value: ""
  });

  // 辅助引用
  const messagesEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const wsTimeoutRef = useRef(null);
  const isSending = useRef(false);
  const lastFetchTimeRef = useRef(0); // 防止重复请求

  // 基础配置
  const BASE_CONFIG = {
    backendUrl: "http://10.11.40.32:3000",
    frontendOrigin: "http://10.11.40.32:5173",
    fetchRetryMax: 3,
    wsReconnectMax: 8,
    wsConnectTimeout: 12000,
    jwtAuthScheme: "Bearer",
    onlineCheckInterval: 5000,
    wsReconnectDelay: 3000,
    minFetchInterval: 1000 // 最小请求间隔
  };

  // 滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, activeChat]);

  // 统一请求头配置
  const getRequestHeaders = () => {
    if (!token || typeof token !== "string" || token.trim() === "") {
      const errMsg = "认证信息缺失，请重新登录";
      setError(errMsg);
      throw new Error(errMsg);
    }
    const cleanToken = token.startsWith(`${BASE_CONFIG.jwtAuthScheme} `) 
      ? token 
      : `${BASE_CONFIG.jwtAuthScheme} ${token.trim()}`;
    
    const headers = new Headers();
    headers.append("Authorization", cleanToken);
    headers.append("Content-Type", "application/json");
    headers.append("Origin", BASE_CONFIG.frontendOrigin);
    headers.append("Accept", "application/json");
    return headers;
  };

  // 请求重试工具
  const fetchWithRetry = async (urlPath, options = {}, retryCount = 0) => {
    const fullUrl = `${BASE_CONFIG.backendUrl}${urlPath}`;
    const mergedOptions = {
      headers: getRequestHeaders(),
      credentials: "include",
      mode: "cors",
      ...options
    };

    try {
      console.log(`[请求] ${mergedOptions.method || "GET"} ${fullUrl}（重试：${retryCount}）`);
      const response = await fetch(fullUrl, mergedOptions);
      const responseData = await response.json().catch(() => ({ error: "响应格式非JSON" }));

      // 401处理
      if (response.status === 401) {
        if (retryCount < BASE_CONFIG.fetchRetryMax) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return fetchWithRetry(urlPath, options, retryCount + 1);
        } else {
          handleHttpError(401, "登录过期，请重新登录");
          throw new Error("认证失败");
        }
      }

      // 其他错误重试
      if (!response.ok && retryCount < BASE_CONFIG.fetchRetryMax) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchWithRetry(urlPath, options, retryCount + 1);
      }

      return { status: response.status, data: responseData, ok: response.ok };
    } catch (err) {
      if (retryCount < BASE_CONFIG.fetchRetryMax && err.message.includes("Failed to fetch")) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchWithRetry(urlPath, options, retryCount + 1);
      }
      throw new Error(`请求异常：${err.message}`);
    }
  };

  // 整合用户状态与群组获取
  const fetchUserStatusAndGroups = async () => {
    // 防止短时间重复请求
    const now = Date.now();
    if (now - lastFetchTimeRef.current < BASE_CONFIG.minFetchInterval) {
      console.log("=== 跳过重复请求（间隔过短）===");
      return;
    }
    lastFetchTimeRef.current = now;

    setLoading(true);
    try {
      console.log("=== 开始加载用户状态和群组数据 ===");
      // 并行请求
      const [userStatusRes, groupsRes] = await Promise.all([
        fetchWithRetry("/api/online"),
        fetchWithRetry("/api/groups/my")
      ]);

      // 处理用户状态数据
      let friendList = [];
      let currentOnline = false;
      let statusMap = {};

      if (userStatusRes.ok && Array.isArray(userStatusRes.data)) {
        console.log("用户状态原始数据:", userStatusRes.data);
        
        // 过滤有效用户
        const validUsers = userStatusRes.data.filter(user => 
          user && typeof user === "object" && 
          typeof user.username === "string" && 
          typeof user.isOnline === "boolean"
        );

        // 自身在线状态
        const currentUser = validUsers.find(u => u.username === username);
        currentOnline = currentUser ? currentUser.isOnline : false;
        console.log("自身在线状态:", currentOnline);

        // 好友列表
        friendList = validUsers
          .filter(u => u.username !== username)
          .map(u => ({
            username: u.username,
            isOnline: u.isOnline,
            userId: u.ID || ""
          }));

        // 在线状态映射表
        statusMap = validUsers.reduce((map, u) => {
          map[u.username] = u.isOnline;
          return map;
        }, {});
      } else {
        console.error("获取用户状态失败，数据格式异常", userStatusRes.data);
        setError("获取用户状态失败：数据格式错误");
      }

      // 处理群组数据
      let groupList = [];
      if (groupsRes.ok) {
        groupList = (groupsRes.data.groups || [])
          .filter(group => group && typeof group.name === "string")
          .map(group => group.name);
        console.log("我的群组列表:", groupList);
      } else {
        console.error("获取群组失败", groupsRes.data);
        setError(prev => prev ? `${prev}；获取群组失败` : "获取群组失败");
      }

      // 更新状态
      setUsers(friendList);
      setGroups(groupList);
      setAmIOnline(currentOnline);
      setOnlineStatusMap(statusMap);
      setError(prev => prev || null);

      // 自动选择第一个群组（仅首次加载）
      if (!hasAutoSelected && groupList.length > 0 && !activeChat.name) {
        setActiveChat({ type: "group", name: groupList[0] });
        setHasAutoSelected(true); // 标记为已自动选择
      }

    } catch (err) {
      const errMsg = `加载数据失败: ${err.message}`;
      console.error(errMsg, err);
      setError(errMsg);
      setUsers([]);
      setGroups([]);
      setAmIOnline(false);
      setOnlineStatusMap({});
    } finally {
      setLoading(false);
    }
  };

  // 统一HTTP错误处理
  const handleHttpError = (status, customMsg = "") => {
    let errMsg = customMsg || `错误 [${status}]`;
    switch (status) {
      case 401:
        errMsg = customMsg || "登录过期，请重新登录";
        setIsTokenValid(false);
        setAmIOnline(false);
        if (ws) {
          ws.close(1008, "认证失效");
          setWs(null);
        }
        setMessages([]);
        setGroups([]);
        setUsers([]);
        onLogout();
        break;
      case 403:
        errMsg = customMsg || "权限不足（未加入该群组）";
        break;
      case 404:
        errMsg = customMsg || "接口不存在，请检查后端配置";
        break;
      case 500:
        errMsg = customMsg || "后端服务器错误，请稍后重试";
        break;
    }
    alert(errMsg);
    return errMsg;
  };

  // 定时刷新逻辑
  useEffect(() => {
    if (!token || !isTokenValid) {
      setLoading(false);
      setError("未获取到有效登录信息");
      setAmIOnline(false);
      return;
    }

    // 初始加载
    const initialTimer = setTimeout(() => {
      fetchUserStatusAndGroups();
    }, 500);

    // 定时刷新
    const refreshInterval = setInterval(() => {
      if (isTokenValid && !loading) {
        fetchUserStatusAndGroups();
      }
    }, BASE_CONFIG.onlineCheckInterval);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(refreshInterval);
    };
  }, [token, onLogout, isTokenValid]);

  // 创建群组
  const handleCreateGroup = async () => {
    if (!isTokenValid) {
      handleHttpError(401);
      return;
    }

    const groupName = newGroupName.trim();
    const rules = [
      { check: !groupName, msg: "群组名称不能为空" },
      { check: groupName.length < 2 || groupName.length > 50, msg: "名称需2-50字符" },
      { check: /[^\u4e00-\u9fa5a-zA-Z0-9_]/g.test(groupName), msg: "仅支持中英文、数字、下划线" },
      { check: groups.includes(groupName), msg: "该群组已存在" }
    ];

    for (const rule of rules) {
      if (rule.check) {
        alert(rule.msg);
        return;
      }
    }

    try {
      const { data, ok } = await fetchWithRetry("/api/groups", {
        method: "POST",
        body: JSON.stringify({ group_name: groupName })
      });

      if (!ok) throw new Error(data.error || "创建失败");
      setShowCreateGroupModal(false);
      setNewGroupName("");
      fetchUserStatusAndGroups();
      alert(`创建成功：${data.group?.name || groupName}`);
    } catch (err) {
      alert(`创建失败: ${err.message}`);
    }
  };

  // 加入群组
  const handleJoinGroup = async () => {
    if (!isTokenValid) {
      handleHttpError(401);
      return;
    }

    const { type, value } = joinGroupParam;
    const paramValue = value.trim();
    if (!paramValue) {
      alert("请输入群组名称或ID");
      return;
    }

    let requestBody = null;
    if (type === "id") {
      const groupId = parseInt(paramValue, 10);
      if (isNaN(groupId) || groupId <= 0) {
        alert("ID需为正整数");
        return;
      }
      requestBody = { group_id: groupId };
    } else {
      if (paramValue.length < 2 || paramValue.length > 50) {
        alert("名称需2-50字符");
        return;
      }
      requestBody = { group_name: paramValue };
    }

    try {
      const { data, ok } = await fetchWithRetry("/api/groups/join", {
        method: "POST",
        body: JSON.stringify(requestBody)
      });

      if (!ok) throw new Error(data.error || "加入失败");
      setShowJoinGroupModal(false);
      setJoinGroupParam({ type: "name", value: "" });
      fetchUserStatusAndGroups();
      alert(data.message || "加入成功");
    } catch (err) {
      alert(`加入失败: ${err.message}`);
    }
  };

  // WebSocket连接
  const connectWebSocket = async () => {
    if (isConnecting || isConnected) {
      console.log("WebSocket连接已在进行中或已连接，跳过重复连接");
      return null;
    }

    if (!token || !isTokenValid) {
      setIsConnected(false);
      return null;
    }

    console.log("开始建立WebSocket连接");
    setIsConnecting(true);
    setError(null);

    // 关闭旧连接
    if (ws) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "关闭旧连接");
        console.log("已关闭旧WebSocket连接");
      }
    }

    try {
      // 构建WebSocket URL
      const wsProtocol = BASE_CONFIG.backendUrl.startsWith("https://") ? "wss:" : "ws:";
      const wsHost = BASE_CONFIG.backendUrl.replace("http://", "").replace("https://", "");
      const wsUrlObj = new URL(`${wsProtocol}//${wsHost}/ws`);
      
      const cleanToken = token.startsWith(`${BASE_CONFIG.jwtAuthScheme} `)
        ? token.replace(`${BASE_CONFIG.jwtAuthScheme} `, "").trim()
        : token.trim();
      
      wsUrlObj.searchParams.append("token", encodeURIComponent(cleanToken));
      const wsUrl = wsUrlObj.toString();
      console.log(`连接WebSocket：${wsUrl}（重连次数：${reconnectAttempts}）`);

      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";

      // 连接超时处理
      wsTimeoutRef.current = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close(1006, "连接超时");
          setIsConnected(false);
          setIsConnecting(false);
          console.error(`WebSocket连接超时（${BASE_CONFIG.wsConnectTimeout/1000}秒）`);
          setError(`连接超时，请检查后端服务`);
        }
      }, BASE_CONFIG.wsConnectTimeout);

      // 连接成功
      socket.onopen = () => {
        clearTimeout(wsTimeoutRef.current);
        console.log("WebSocket连接成功");
        setIsConnected(true);
        setIsConnecting(false);
        setReconnectAttempts(0);
        setError(null);
        
        // 发送初始化消息
        try {
          socket.send(JSON.stringify({
            type: "init",
            username: username,
            timestamp: new Date().toISOString()
          }));
          console.log("WebSocket初始化消息发送成功");
        } catch (err) {
          console.error("发送初始化消息失败:", err);
        }
      };

      // 接收消息
      socket.onmessage = (event) => {
        try {
          if (!event.data) return;
          const msg = typeof event.data === "string" ? JSON.parse(event.data) : {};
          
          // 处理认证失败消息
          if (msg.type === "auth_failed") {
            console.error("WebSocket认证失败:", msg.message);
            setError("WebSocket认证失败，正在重试...");
            socket.close(1008, "认证失败");
            if (reconnectAttempts < BASE_CONFIG.wsReconnectMax) {
              setTimeout(() => {
                setReconnectAttempts(prev => prev + 1);
                connectWebSocket();
              }, 1000);
            }
            return;
          }

          // 系统消息处理
          if (msg.from === "system") {
            if (["user_joined", "user_left"].includes(msg.type)) {
              fetchUserStatusAndGroups();
            } else {
              setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                from: "系统通知",
                content: msg.content || "收到系统消息",
                time: new Date().toISOString(),
                isTemp: false
              }]);
            }
            return;
          }

          // 业务消息校验
          if (!msg.from || !msg.content || !msg.time) {
            throw new Error(`消息格式错误：${JSON.stringify(msg)}`);
          }

          // 临时消息替换+去重
          setMessages(prev => {
            let hasReplaced = false;
            const updated = prev.map(item => {
              const isTempMatch = item.isTemp && 
                item.from === username && 
                ((item.group && msg.group && item.group === msg.group) || 
                 (item.to && msg.to && item.to === msg.to)) && 
                item.content === msg.content;

              if (isTempMatch) {
                hasReplaced = true;
                return { ...msg, isTemp: false, id: item.id };
              }
              return item;
            });

            if (!hasReplaced) {
              const isDuplicate = updated.some(item => 
                (item.uuid && item.uuid === msg.uuid) || 
                (item.from === msg.from && item.content === msg.content && item.time === msg.time)
              );
              if (!isDuplicate) updated.push({ ...msg, isTemp: false });
            }
            return updated;
          });

          // 未读计数
          if (msg.group || (msg.to === username)) {
            const unreadKey = msg.group ? `group:${msg.group}` : `user:${msg.from}`;
            const isCurrent = (activeChat.type === "group" && activeChat.name === msg.group) ||
                              (activeChat.type === "private" && activeChat.name === msg.from);
            
            if (!isCurrent) {
              setUnreadCounts(prev => ({ ...prev, [unreadKey]: (prev[unreadKey] || 0) + 1 }));
            }
          }
        } catch (err) {
          console.error("解析消息失败:", err, "原始数据:", event.data);
        }
      };

      // 连接关闭
      socket.onclose = (event) => {
        clearTimeout(wsTimeoutRef.current);
        console.log(`WebSocket关闭 [${event.code}]：${event.reason}`);
        setIsConnected(false);
        setIsConnecting(false);

        // 认证失败时立即重试
        const isAuthError = event.code === 1008 || event.reason.includes("auth");
        
        // 非主动关闭且未达最大重连次数
        if (event.code !== 1000 && reconnectAttempts < BASE_CONFIG.wsReconnectMax) {
          const delay = isAuthError ? 1000 : BASE_CONFIG.wsReconnectDelay;
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        } else if (reconnectAttempts >= BASE_CONFIG.wsReconnectMax) {
          const errMsg = "WebSocket重连失败，请检查后端服务或刷新页面";
          setError(errMsg);
          alert(errMsg);
        }
      };

      // 连接错误
      socket.onerror = (err) => {
        clearTimeout(wsTimeoutRef.current);
        console.error("WebSocket错误:", err);
        setIsConnecting(false);
        const errMsg = "WebSocket连接错误，正在重试...";
        setError(errMsg);
        if (document.visibilityState === "visible") {
          alert(errMsg);
        }
      };

      setWs(socket);
      return socket;
    } catch (err) {
      console.error("创建WebSocket失败:", err);
      setIsConnected(false);
      setIsConnecting(false);
      setError(`连接建立失败: ${err.message}`);
      return null;
    }
  };

  // 手动重连按钮功能
  const handleManualReconnect = () => {
    if (!isTokenValid) {
      alert("请先登录");
      return;
    }
    setReconnectAttempts(0);
    connectWebSocket();
  };

  // WebSocket生命周期管理
  useEffect(() => {
    if (!token || !isTokenValid) return;

    // 清理重连定时器
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 尝试连接WebSocket
    const startConnection = async () => {
      // 等待用户信息加载完成
      await new Promise(resolve => {
        const checkLoaded = () => {
          if (!loading) resolve();
          else setTimeout(checkLoaded, 100);
        };
        checkLoaded();
      });
      connectWebSocket();
    };

    startConnection();

    // 组件卸载清理
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsTimeoutRef.current) clearTimeout(wsTimeoutRef.current);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "组件卸载");
        }
      }
    };
  }, [token, reconnectAttempts, isTokenValid, username]);

  // 发送消息
  const sendMessage = () => {
    // 输入验证
    if (!input.trim()) {
      alert("请输入消息内容");
      return;
    }
    
    // 连接状态验证
    if (!isTokenValid) {
      alert("认证已失效，请重新登录");
      onLogout();
      return;
    }
    
    // 活动聊天验证
    if (!activeChat.name) {
      alert("请先选择聊天对象");
      return;
    }

    // 处理连接中状态
    if (!isConnected) {
      if (isConnecting) {
        alert("正在建立连接，请稍候...");
        return;
      }
      
      // 尝试建立连接并发送消息
      alert("连接未就绪，正在尝试连接...");
      connectWebSocket().then(socket => {
        if (socket) {
          const sendAfterConnect = () => {
            if (socket.readyState === WebSocket.OPEN) {
              sendMessage();
            } else if (socket.readyState === WebSocket.CONNECTING) {
              setTimeout(sendAfterConnect, 100);
            } else {
              alert("连接建立失败，无法发送消息");
            }
          };
          sendAfterConnect();
        } else {
          alert("无法建立连接，请检查网络或刷新页面");
        }
      });
      return;
    }

    // 构建消息 payload
    const msgPayload = activeChat.type === "group"
      ? { 
          content: input, 
          group: activeChat.name,
          type: "group_message",
          timestamp: new Date().toISOString()
        }
      : { 
          content: input, 
          to: activeChat.name,
          type: "private_message",
          timestamp: new Date().toISOString()
        };

    // 生成临时消息ID
    const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const tempMsg = {
      id: tempId,
      isTemp: true,
      from: username,
      to: activeChat.type === "private" ? activeChat.name : undefined,
      group: activeChat.type === "group" ? activeChat.name : undefined,
      content: input,
      time: new Date().toISOString()
    };

    // 添加临时消息到UI
    setMessages(prev => [...prev, tempMsg]);
    setInput("");

    // 发送消息
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket状态异常: ${ws ? ws.readyState : '未初始化'}`);
      }

      const jsonString = JSON.stringify(msgPayload);
      ws.send(jsonString);
      console.log("消息发送成功:", jsonString);
    } catch (err) {
      console.error("消息发送失败:", err);
      
      // 从UI移除临时消息
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setInput(input);
      
      // 错误提示
      if (err.message.includes("状态异常")) {
        alert("连接已断开，请尝试重新连接");
        if (reconnectAttempts < BASE_CONFIG.wsReconnectMax) {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }
      } else if (err.message.includes("NetworkError")) {
        alert("网络错误，请检查网络连接");
      } else {
        alert(`发送失败: ${err.message}\n请重试`);
      }
    } finally {
      isSending.current = false;
    }
  };

  // 回车键发送
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSending.current) {
        isSending.current = true;
        sendMessage();
      }
    }
  };

  // 切换聊天对象
  const handleChatSelect = (type, name) => {
    setActiveChat({ type, name });
    const unreadKey = `${type}:${name}`;
    setUnreadCounts(prev => ({ ...prev, [unreadKey]: 0 }));
  };

  // 过滤当前聊天消息
  const filteredMessages = messages.filter((m) => {
    if (m.from === "system") return false;
    if (activeChat.type === "group") return m.group === activeChat.name;
    if (activeChat.type === "private") {
      return (m.from === activeChat.name && m.to === username) || 
             (m.from === username && m.to === activeChat.name);
    }
    return false;
  });

  // Token有效性监控
  useEffect(() => {
    if (!token) {
      alert("未获取到登录信息，请重新登录");
      setIsTokenValid(false);
      setAmIOnline(false);
      onLogout();
    }
  }, [token, onLogout]);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      fontFamily: "Arial, sans-serif"
    }}>
      {/* 左侧：用户/群组列表 */}
      <div style={{
        width: "260px",
        borderRight: "1px solid #e0e0e0",
        padding: "16px",
        backgroundColor: "#fafafa",
        overflowY: "auto"
      }}>
        {/* 顶部：标题+操作按钮+连接状态 */}
        <div style={{
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px"
        }}>
          <h3 style={{ margin: "0", fontSize: "1.1rem", color: "#333" }}>聊天列表</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setShowCreateGroupModal(true)}
              disabled={!isTokenValid || !isConnected}
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                backgroundColor: (!isTokenValid || !isConnected) ? "#ccc" : "#28a745",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: (!isTokenValid || !isConnected) ? "not-allowed" : "pointer",
              }}
            >
              创建群组
            </button>
            <button
              onClick={() => setShowJoinGroupModal(true)}
              disabled={!isTokenValid || !isConnected}
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                backgroundColor: (!isTokenValid || !isConnected) ? "#ccc" : "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: (!isTokenValid || !isConnected) ? "not-allowed" : "pointer",
              }}
            >
              加入群组
            </button>
            
            {/* 手动重连按钮 */}
            <button
              onClick={handleManualReconnect}
              disabled={isConnecting || isConnected || !isTokenValid}
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                backgroundColor: (isConnecting || isConnected || !isTokenValid) ? "#ccc" : "#ff9800",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: (isConnecting || isConnected || !isTokenValid) ? "not-allowed" : "pointer",
              }}
            >
              重连
            </button>
            
            {/* 连接状态显示 */}
            <span style={{
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              color: !amIOnline ? "#dc3545" : isConnected ? "#28a745" : isConnecting ? "#ffc107" : "#ff9800"
            }}>
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: !amIOnline ? "#dc3545" : isConnected ? "#28a745" : isConnecting ? "#ffc107" : "#ff9800",
                marginRight: "4px"
              }}></span>
              {!amIOnline ? "离线" : isConnected ? "在线" : isConnecting ? "连接中..." : "未连接"}
            </span>
          </div>
        </div>

        {/* 错误提示区域 */}
        {error && (
          <div style={{
            color: "#dc3545",
            fontSize: "0.85rem",
            padding: "8px",
            backgroundColor: "#f8d7da",
            borderRadius: "4px",
            marginBottom: "16px",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        {/* 群组列表 */}
        <div style={{ marginBottom: "24px" }}>
          <h4 style={{
            margin: "0 0 8px 0",
            fontSize: "0.9rem",
            color: "#666",
            borderBottom: "1px solid #e0e0e0",
            paddingBottom: "6px"
          }}>
            群组 ({groups.length})
          </h4>
          {loading ? (
            <div style={{ color: "#888", fontSize: "0.85rem", padding: "8px" }}>加载群组中...</div>
          ) : groups.length === 0 ? (
            <div style={{ color: "#888", fontSize: "0.85rem", padding: "8px" }}>暂无群组，可创建或加入</div>
          ) : (
            groups.map((groupName) => {
              const key = `group:${groupName}`;
              return (
                <div
                  key={groupName}
                  onClick={() => handleChatSelect("group", groupName)}
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    marginBottom: "6px",
                    backgroundColor: activeChat.type === "group" && activeChat.name === groupName ? "#007bff" : "transparent",
                    color: activeChat.type === "group" && activeChat.name === groupName ? "#fff" : "#333",
                    transition: "background-color 0.2s",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span>{groupName}</span>
                  {unreadCounts[key] > 0 && (
                    <span style={{
                      backgroundColor: "#dc3545",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "2px 8px",
                      fontSize: "0.7rem"
                    }}>
                      {unreadCounts[key]}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 在线用户列表 */}
        <div>
          <h4 style={{
            margin: "0 0 8px 0",
            fontSize: "0.9rem",
            color: "#666",
            borderBottom: "1px solid #e0e0e0",
            paddingBottom: "6px"
          }}>
            在线用户 ({users.filter(u => u.isOnline).length}/{users.length})
          </h4>
          {loading ? (
            <div style={{ color: "#888", fontSize: "0.85rem", padding: "8px" }}>加载用户中...</div>
          ) : users.length === 0 ? (
            <div style={{ color: "#888", fontSize: "0.85rem", padding: "8px" }}>暂无在线用户</div>
          ) : (
            users.map((user) => {
              if (user.username === username) return null;
              const key = `user:${user.username}`;
              return (
                <div
                  key={user.username}
                  onClick={() => handleChatSelect("private", user.username)}
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    marginBottom: "6px",
                    backgroundColor: activeChat.type === "private" && activeChat.name === user.username ? "#007bff" : "transparent",
                    color: activeChat.type === "private" && activeChat.name === user.username ? "#fff" : "#333",
                    transition: "background-color 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: user.isOnline ? "#28a745" : "#ccc",
                      marginRight: "10px"
                    }}></span>
                    <span>{user.username}</span>
                  </div>
                  {unreadCounts[key] > 0 && (
                    <span style={{
                      backgroundColor: "#dc3545",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "2px 8px",
                      fontSize: "0.7rem"
                    }}>
                      {unreadCounts[key]}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 退出登录按钮 */}
        <button
          onClick={onLogout}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "10px",
            backgroundColor: "#dc3545",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.9rem",
            transition: "background-color 0.2s"
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = "#c82333"}
          onMouseOut={(e) => e.target.style.backgroundColor = "#dc3545"}
        >
          退出登录
        </button>
      </div>

      {/* 右侧：消息区+输入区 */}
      <div style={{
        flex: "1",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#fff"
      }}>
        {/* 聊天标题栏 */}
        {activeChat.name && (
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid #e0e0e0",
            backgroundColor: "#f8f9fa",
            fontSize: "1rem",
            fontWeight: "500",
            color: "#333"
          }}>
            {activeChat.type === "group" ? "群组聊天：" : "私聊："}
            <span style={{ color: "#007bff" }}>{activeChat.name}</span>
            
            {/* 私聊时显示对方在线状态 */}
            {activeChat.type === "private" && (
              <span style={{ 
                marginLeft: "10px", 
                fontSize: "0.8rem",
                color: onlineStatusMap[activeChat.name] ? "#28a745" : "#dc3545"
              }}>
                {onlineStatusMap[activeChat.name] ? "（在线）" : "（离线）"}
              </span>
            )}
            
            {/* 自身在线状态 */}
            <span style={{ 
              marginLeft: "10px", 
              fontSize: "0.8rem",
              color: amIOnline ? "#28a745" : "#dc3545"
            }}>
              我：{amIOnline ? "在线" : "离线"}
            </span>
          </div>
        )}

        {/* 消息区域 */}
        <div style={{
          flex: "1",
          overflowY: "auto",
          padding: "20px",
          backgroundColor: "#f8f9fa"
        }}>
          {/* 离线状态提示 */}
          {!amIOnline && (
            <div style={{
              backgroundColor: "#fff3cd",
              color: "#856404",
              padding: "10px 15px",
              borderRadius: "4px",
              marginBottom: "15px",
              fontSize: "0.9rem",
              textAlign: "center"
            }}>
              您当前处于离线状态，消息可能无法送达
            </div>
          )}

          {/* 未连接状态提示 */}
          {!isConnected && !isConnecting && (
            <div style={{
              backgroundColor: "#ffebee",
              color: "#b71c1c",
              padding: "10px 15px",
              borderRadius: "4px",
              marginBottom: "15px",
              fontSize: "0.9rem",
              textAlign: "center"
            }}>
              未连接到服务器，请检查连接或点击左侧"重连"按钮
            </div>
          )}

          {!activeChat.name ? (
            <div style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6c757d",
              fontSize: "1.1rem"
            }}>
              请从左侧选择群组或用户开始聊天
            </div>
          ) : filteredMessages.length === 0 ? (
            <div style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6c757d",
              fontSize: "1.1rem"
            }}>
              暂无消息，发送第一条消息吧～
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div
                key={msg.id || `${msg.from}-${msg.time}-${msg.content}`}
                style={{
                  display: "flex",
                  marginBottom: "16px",
                  justifyContent: msg.from === username ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "12px 16px",
                    borderRadius: msg.from === username ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    backgroundColor: msg.isTemp ? "#b3d9ff" :
                      (msg.from === username ? "#007bff" : "#fff"),
                    color: msg.from === username ? "#fff" : "#333",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    opacity: msg.isTemp ? 0.8 : 1,
                  }}
                >
                  {msg.from !== username && (
                    <div style={{
                      fontSize: "0.8rem",
                      fontWeight: "600",
                      marginBottom: "4px",
                      color: "#007bff"
                    }}>
                      {msg.from}
                    </div>
                  )}
                  <div style={{ fontSize: "0.95rem", lineHeight: "1.4" }}>
                    {msg.content}
                    {msg.isTemp && <span style={{ fontSize: "0.8rem", marginLeft: "8px" }}>发送中...</span>}
                  </div>
                  <div style={{
                    fontSize: "0.7rem",
                    marginTop: "6px",
                    textAlign: msg.from === username ? "right" : "left",
                    opacity: "0.8"
                  }}>
                    {new Date(msg.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        {activeChat.name && (
          <div style={{
            padding: "16px",
            borderTop: "1px solid #e0e0e0",
            backgroundColor: "#fff",
            display: "flex",
            gap: "12px"
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={!isConnected ? "未连接到服务器，消息将在连接后发送..." : "输入消息（Shift+Enter换行）..."}
              rows="2"
              disabled={!isTokenValid}  
              style={{
                flex: "1",
                padding: "12px 16px",
                borderRadius: "24px",
                border: "1px solid #e0e0e0",
                resize: "none",
                outline: "none",
                fontSize: "0.95rem",
                backgroundColor: !isTokenValid ? "#f5f5f5" : "#fff",
                cursor: !isTokenValid ? "not-allowed" : "text",
                transition: "border-color 0.2s"
              }}
              onFocus={(e) => !(!isConnected || !isTokenValid) && (e.target.style.border = "1px solid #007bff")}
              onBlur={(e) => !(!isConnected || !isTokenValid) && (e.target.style.border = "1px solid #e0e0e0")}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !isTokenValid}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: (!input.trim() || !isTokenValid) ? "#e9ecef" : 
                                 (!isConnected ? "#ffc107" : "#007bff"),
                color: "#fff",
                border: "none",
                cursor: (!input.trim() || !isTokenValid) ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.2s"
              }}
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* 创建群组弹窗 */}
      {showCreateGroupModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "#fff",
            padding: "24px",
            borderRadius: "8px",
            width: "300px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", color: "#333" }}>创建群组</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="输入群组名称（2-50字符）"
              style={{
                width: "100%",
                padding: "8px 12px",
                marginBottom: "16px",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || newGroupName.length < 2 || newGroupName.length > 50}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  opacity: (!newGroupName.trim() || newGroupName.length < 2 || newGroupName.length > 50) ? 0.6 : 1,
                }}
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加入群组弹窗 */}
      {showJoinGroupModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "#fff",
            padding: "24px",
            borderRadius: "8px",
            width: "300px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", color: "#333" }}>加入群组</h3>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <label>
                  <input
                    type="radio"
                    name="joinType"
                    checked={joinGroupParam.type === "name"}
                    onChange={() => setJoinGroupParam({ ...joinGroupParam, type: "name" })}
                  />
                  按名称加入
                </label>
                <label>
                  <input
                    type="radio"
                    name="joinType"
                    checked={joinGroupParam.type === "id"}
                    onChange={() => setJoinGroupParam({ ...joinGroupParam, type: "id" })}
                  />
                  按ID加入
                </label>
              </div>
              <input
                type={joinGroupParam.type === "id" ? "number" : "text"}
                value={joinGroupParam.value}
                onChange={(e) => setJoinGroupParam({ ...joinGroupParam, value: e.target.value })}
                placeholder={joinGroupParam.type === "id" ? "输入群组ID" : "输入群组名称"}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setShowJoinGroupModal(false)}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                onClick={handleJoinGroup}
                disabled={!joinGroupParam.value.trim()}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#007bff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  opacity: !joinGroupParam.value.trim() ? 0.6 : 1,
                }}
              >
                确认加入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
    