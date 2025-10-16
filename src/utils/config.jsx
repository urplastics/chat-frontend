// 统一管理API地址，避免硬编码，后续修改只需改一处
export const API_BASE = "http://10.11.40.32:3000";

export default defineConfig({
    server: {
        proxy: {
            '/api': 'http://10.11.40.32:3000',  // 指向你的 Go 后端
            '/ws': 'http://10.11.40.32:3000',   // WebSocket 也可以代理
          },
      host: '0.0.0.0',  // 监听所有网络接口
      port: 5173,       // 指定端口（可选）
      strictPort: true  // 如果端口被占用则退出（可选）
    }
  })

// WebSocket地址（自动替换HTTP/HTTPS为WS/WSS，适配生产环境）
export const getWsBase = () => API_BASE.replace(/^http/, "ws");

// 常量定义（统一管理，提升可读性）
export const MAX_RECONNECT_ATTEMPTS = 5; // 最大重连次数
export const WS_CONNECT_TIMEOUT = 10000; // WebSocket连接超时（10s）
export const INPUT_MIN_LENGTH = 1; // 消息输入最小长度
export const PASSWORD_MIN_LENGTH = 6; // 密码最小长度