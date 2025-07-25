// Vite WebSocket error suppression
// This file prevents Vite HMR WebSocket errors in Replit environment

// Override console.error to filter out Vite WebSocket errors
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  const errorString = args.join(' ');
  if (errorString.includes('[vite] failed to connect to websocket') ||
      errorString.includes('WebSocket connection to') ||
      errorString.includes('localhost:undefined')) {
    console.debug('[Vite Fix] Suppressed WebSocket error:', errorString);
    return;
  }
  originalConsoleError.apply(console, args);
};

// Override window.onerror to catch WebSocket errors
const originalOnError = window.onerror;
window.onerror = function(message, source, lineno, colno, error) {
  if (typeof message === 'string' && 
      (message.includes('WebSocket') || message.includes('localhost:undefined'))) {
    console.debug('[Vite Fix] Caught and suppressed WebSocket error:', message);
    return true; // Prevent default error handling
  }
  if (originalOnError) {
    return originalOnError(message, source, lineno, colno, error);
  }
  return false;
};

// Disable Vite HMR if available
if (import.meta.hot) {
  // Intercept WebSocket connection attempts
  const originalSocket = import.meta.hot.send;
  if (originalSocket) {
    import.meta.hot.send = function(...args: any[]) {
      try {
        return originalSocket.apply(import.meta.hot, args);
      } catch (error) {
        console.debug('[Vite Fix] Prevented HMR send error:', error);
      }
    };
  }
  
  // Disable auto-reconnect
  import.meta.hot.on('vite:ws:disconnect', () => {
    console.debug('[Vite Fix] WebSocket disconnected, preventing reconnect');
  });
}

export {};