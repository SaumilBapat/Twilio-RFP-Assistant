import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  event: string;
  data: any;
}

export function useWebSocket(userId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Use same host:port as current page, but handle cases where port might be empty
    const wsUrl = window.location.port 
      ? `${protocol}//${window.location.hostname}:${window.location.port}/ws?userId=${userId}`
      : `${protocol}//${window.location.host}/ws?userId=${userId}`;
    
    console.log('🔌 [WebSocket] Connecting to:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket] Connected successfully');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 [WebSocket] Received message:', message);
        setLastMessage(message);
      } catch (error) {
        console.error('❌ [WebSocket] Failed to parse message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔌 [WebSocket] Connection closed:', event.code, event.reason);
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('❌ [WebSocket] Connection error:', error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [userId]);

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return {
    isConnected,
    lastMessage,
    sendMessage
  };
}
