# WebSocket Realtime

Nexus Framework menyediakan **WebSocket support** built-in untuk membangun aplikasi realtime seperti chat, notifications, live updates, dan lainnya.

## Quick Start

```typescript
import { createApp } from 'nexus';

const app = createApp();

// Define WebSocket route
app.ws('/ws/chat', {
  onConnect: async (socket, ctx) => {
    console.log('Client connected');
    socket.send(JSON.stringify({ type: 'welcome', message: 'Hello!' }));
  },

  onMessage: async (socket, message, ctx) => {
    console.log('Received:', message);
    socket.send(JSON.stringify({ echo: message }));
  },

  onClose: async (socket, ctx) => {
    console.log('Client disconnected');
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
  console.log('WebSocket at ws://localhost:3000/ws/chat');
});
```

## WebSocketRouteConfig Interface

```typescript
interface WebSocketRouteConfig {
  /** Authentication handler - validate token and return user object */
  auth?: (ctx: WebSocketContext) => Promise<any>;
  
  /** Called before onConnect - can be used for additional setup */
  beforeConnect?: (socket: WebSocket, ctx: WebSocketContext) => Promise<void>;
  
  /** Called when client connects */
  onConnect?: (socket: WebSocket, ctx: WebSocketContext) => Promise<void>;
  
  /** Called when client sends a message */
  onMessage?: (socket: WebSocket, message: any, ctx: WebSocketContext) => Promise<void>;
  
  /** Called when client disconnects */
  onClose?: (socket: WebSocket, ctx: WebSocketContext, code: number, reason?: Buffer) => Promise<void>;
  
  /** Called on WebSocket error */
  onError?: (socket: WebSocket, error: Error, ctx: WebSocketContext) => Promise<void>;
  
  /** Enable room support (default: true) */
  rooms?: boolean;
}
```

## WebSocketContext

Context object yang tersedia di setiap handler:

```typescript
interface WebSocketContext {
  /** WebSocket path (e.g., '/ws/chat') */
  path: string;
  
  /** Query parameters from URL */
  query: Record<string, string | string[]>;
  
  /** Request headers */
  headers: IncomingMessage['headers'];
  
  /** User object (set by auth handler) */
  user?: any;
  
  /** Custom metadata */
  metadata?: Record<string, any>;
  
  /** Raw Node.js request */
  raw: {
    req: IncomingMessage;
  };
}
```

## Fitur-Fitur

### 1. Authentication

Validasi token/credentials sebelum koneksi diterima:

```typescript
app.ws('/ws/protected', {
  auth: async (ctx) => {
    const token = ctx.query.token as string;
    
    if (!token) {
      throw new Error('Token required');
    }
    
    // Verify JWT token
    const user = await verifyToken(token);
    
    if (!user) {
      throw new Error('Invalid token');
    }
    
    // Return user object - will be available as ctx.user
    return user;
  },

  onConnect: async (socket, ctx) => {
    // ctx.user is now available
    console.log(`User ${ctx.user.name} connected`);
    
    socket.send(JSON.stringify({
      type: 'authenticated',
      user: ctx.user
    }));
  },

  onMessage: async (socket, message, ctx) => {
    console.log(`Message from ${ctx.user.name}:`, message);
  }
});
```

**Client connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/protected?token=your-jwt-token');
```

### 2. Room Management

Kelompokkan koneksi ke dalam "rooms" untuk broadcast targeted:

```typescript
app.ws('/ws/chat', {
  onConnect: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    const room = ctx.query.room as string || 'general';
    
    // Join a room
    ws.joinRoom(room, socket);
    
    // Notify others in the room
    ws.broadcast(room, {
      type: 'user_joined',
      message: `New user joined ${room}`
    });
    
    socket.send(JSON.stringify({
      type: 'joined',
      room
    }));
  },

  onMessage: async (socket, message, ctx) => {
    const ws = app.getWebSocket()!;
    
    if (message.type === 'chat') {
      // Broadcast to current room
      ws.broadcast(message.room, {
        type: 'chat',
        user: ctx.user?.name,
        text: message.text,
        timestamp: new Date().toISOString()
      });
    }
    
    if (message.type === 'join_room') {
      ws.joinRoom(message.room, socket);
      socket.send(JSON.stringify({ type: 'room_joined', room: message.room }));
    }
    
    if (message.type === 'leave_room') {
      ws.leaveRoom(message.room, socket);
      socket.send(JSON.stringify({ type: 'room_left', room: message.room }));
    }
  },

  onClose: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    
    // Broadcast user left (rooms are auto-cleaned)
    ws.broadcast('general', {
      type: 'user_left',
      user: ctx.user?.name
    });
  }
});
```

### 3. Broadcasting

Kirim pesan ke semua client dalam room:

```typescript
const ws = app.getWebSocket()!;

// Broadcast to specific room
ws.broadcast('notifications', {
  type: 'alert',
  message: 'System maintenance in 5 minutes'
});

// Broadcast to multiple rooms
['room1', 'room2', 'room3'].forEach(room => {
  ws.broadcast(room, { type: 'announcement', text: 'Hello everyone!' });
});
```

### 4. Room Manager API

```typescript
const ws = app.getWebSocket()!;

// Create room explicitly
ws.createRoom('vip-lounge');

// Join room
ws.joinRoom('vip-lounge', socket);

// Leave room
ws.leaveRoom('vip-lounge', socket);

// Broadcast to room
ws.broadcast('vip-lounge', { message: 'VIP announcement' });

// Using roomManager helper
ws.roomManager.create('new-room');
ws.roomManager.join('new-room', socket);
ws.roomManager.leave('new-room', socket);
ws.roomManager.broadcast('new-room', { data: 'hello' });
ws.roomManager.list(); // ['new-room', 'vip-lounge', ...]
```

## Contoh Penggunaan

### Chat Application

```typescript
app.ws('/ws/chat', {
  auth: async (ctx) => {
    const token = ctx.query.token as string;
    return { id: generateId(), name: token || 'Anonymous' };
  },

  onConnect: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    
    // Join default room
    ws.joinRoom('general', socket);
    
    // Welcome message
    socket.send(JSON.stringify({
      type: 'welcome',
      message: `Welcome ${ctx.user.name}!`,
      room: 'general'
    }));
    
    // Notify others
    ws.broadcast('general', {
      type: 'system',
      message: `${ctx.user.name} joined the chat`
    });
  },

  onMessage: async (socket, message, ctx) => {
    const ws = app.getWebSocket()!;
    
    switch (message.type) {
      case 'chat':
        ws.broadcast(message.room || 'general', {
          type: 'chat',
          user: ctx.user.name,
          text: message.text,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'private':
        // Private message implementation
        // Find target socket and send directly
        break;
        
      case 'typing':
        ws.broadcast(message.room || 'general', {
          type: 'typing',
          user: ctx.user.name
        });
        break;
    }
  },

  onClose: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    ws.broadcast('general', {
      type: 'system',
      message: `${ctx.user.name} left the chat`
    });
  },

  onError: async (socket, error, ctx) => {
    console.error(`WebSocket error for ${ctx.user?.name}:`, error);
  }
});
```

### Notifications Service

```typescript
app.ws('/ws/notifications', {
  auth: async (ctx) => {
    const token = ctx.query.token as string;
    return await verifyToken(token);
  },

  onConnect: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    
    // Join user-specific room
    ws.joinRoom(`user:${ctx.user.id}`, socket);
    
    // Join role-based rooms
    ctx.user.roles.forEach((role: string) => {
      ws.joinRoom(`role:${role}`, socket);
    });
    
    // Send unread notifications
    const unread = await getUnreadNotifications(ctx.user.id);
    socket.send(JSON.stringify({
      type: 'unread',
      count: unread.length,
      notifications: unread
    }));
  },

  onMessage: async (socket, message, ctx) => {
    if (message.type === 'mark_read') {
      await markNotificationRead(message.notificationId, ctx.user.id);
      socket.send(JSON.stringify({
        type: 'marked_read',
        notificationId: message.notificationId
      }));
    }
  }
});

// Send notification from anywhere in your app
function sendNotification(userId: string, notification: any) {
  const ws = app.getWebSocket();
  ws?.broadcast(`user:${userId}`, {
    type: 'notification',
    ...notification
  });
}

// Send to all admins
function notifyAdmins(message: string) {
  const ws = app.getWebSocket();
  ws?.broadcast('role:admin', {
    type: 'admin_alert',
    message
  });
}
```

### Live Updates / Real-time Data

```typescript
app.ws('/ws/stocks', {
  onConnect: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    const symbols = (ctx.query.symbols as string)?.split(',') || ['AAPL', 'GOOGL'];
    
    // Subscribe to stock symbols
    symbols.forEach(symbol => {
      ws.joinRoom(`stock:${symbol}`, socket);
    });
    
    socket.send(JSON.stringify({
      type: 'subscribed',
      symbols
    }));
  },

  onMessage: async (socket, message, ctx) => {
    const ws = app.getWebSocket()!;
    
    if (message.type === 'subscribe') {
      ws.joinRoom(`stock:${message.symbol}`, socket);
    }
    
    if (message.type === 'unsubscribe') {
      ws.leaveRoom(`stock:${message.symbol}`, socket);
    }
  }
});

// Price update service (simulated)
setInterval(() => {
  const ws = app.getWebSocket();
  const stocks = ['AAPL', 'GOOGL', 'MSFT', 'AMZN'];
  
  stocks.forEach(symbol => {
    ws?.broadcast(`stock:${symbol}`, {
      type: 'price_update',
      symbol,
      price: (Math.random() * 1000).toFixed(2),
      timestamp: new Date().toISOString()
    });
  });
}, 1000);
```

### Multiplayer Game

```typescript
app.ws('/ws/game', {
  auth: async (ctx) => {
    return {
      id: generatePlayerId(),
      name: ctx.query.name as string || 'Player'
    };
  },

  onConnect: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    const gameId = ctx.query.game as string;
    
    if (!gameId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Game ID required' }));
      socket.close();
      return;
    }
    
    // Join game room
    ws.joinRoom(`game:${gameId}`, socket);
    
    // Notify other players
    ws.broadcast(`game:${gameId}`, {
      type: 'player_joined',
      player: ctx.user
    });
    
    // Send current game state
    const gameState = await getGameState(gameId);
    socket.send(JSON.stringify({
      type: 'game_state',
      state: gameState
    }));
  },

  onMessage: async (socket, message, ctx) => {
    const ws = app.getWebSocket()!;
    const gameId = ctx.query.game as string;
    
    switch (message.type) {
      case 'move':
        const result = await processMove(gameId, ctx.user.id, message.move);
        ws.broadcast(`game:${gameId}`, {
          type: 'move_made',
          player: ctx.user.id,
          move: message.move,
          result
        });
        break;
        
      case 'chat':
        ws.broadcast(`game:${gameId}`, {
          type: 'game_chat',
          player: ctx.user.name,
          text: message.text
        });
        break;
    }
  },

  onClose: async (socket, ctx) => {
    const ws = app.getWebSocket()!;
    const gameId = ctx.query.game as string;
    
    ws.broadcast(`game:${gameId}`, {
      type: 'player_left',
      player: ctx.user
    });
  }
});
```

## Client-Side Examples

### Browser (Vanilla JavaScript)

```javascript
// Basic connection
const ws = new WebSocket('ws://localhost:3000/ws/chat?token=myname');

ws.onopen = () => {
  console.log('Connected!');
  ws.send(JSON.stringify({ type: 'chat', text: 'Hello!' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onclose = () => {
  console.log('Disconnected');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### React Hook

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';

function useWebSocket(url: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev, data]);
    };

    return () => ws.close();
  }, [url]);

  const send = useCallback((data: any) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  return { messages, isConnected, send };
}

// Usage
function ChatComponent() {
  const { messages, isConnected, send } = useWebSocket('ws://localhost:3000/ws/chat?token=user1');

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      <button onClick={() => send({ type: 'chat', text: 'Hello!' })}>
        Send
      </button>
      <ul>
        {messages.map((msg, i) => (
          <li key={i}>{JSON.stringify(msg)}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Node.js Client

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/ws/chat?token=bot');

ws.on('open', () => {
  console.log('Connected to server');
  ws.send(JSON.stringify({ type: 'chat', text: 'Bot is online!' }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
  
  // Auto-reply to messages
  if (message.type === 'chat' && message.user !== 'bot') {
    ws.send(JSON.stringify({
      type: 'chat',
      text: `You said: ${message.text}`
    }));
  }
});

ws.on('close', () => {
  console.log('Disconnected');
});
```

## Error Handling

```typescript
app.ws('/ws/robust', {
  auth: async (ctx) => {
    try {
      const token = ctx.query.token as string;
      if (!token) {
        throw new Error('AUTH_REQUIRED');
      }
      
      const user = await verifyToken(token);
      if (!user) {
        throw new Error('INVALID_TOKEN');
      }
      
      return user;
    } catch (error) {
      // Throwing here will reject the connection
      throw error;
    }
  },

  onConnect: async (socket, ctx) => {
    try {
      // Setup logic
      const ws = app.getWebSocket()!;
      ws.joinRoom('main', socket);
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to setup connection'
      }));
      socket.close(1011, 'Setup failed');
    }
  },

  onMessage: async (socket, message, ctx) => {
    try {
      // Validate message
      if (!message.type) {
        throw new Error('Message type required');
      }
      
      // Process message
      await processMessage(message, ctx);
      
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  },

  onError: async (socket, error, ctx) => {
    console.error('WebSocket Error:', {
      user: ctx.user?.id,
      error: error.message,
      stack: error.stack
    });
    
    // Optionally send error to client
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Internal server error'
      }));
    }
  }
});
```

## Best Practices

### 1. Heartbeat/Ping-Pong

```typescript
app.ws('/ws/with-heartbeat', {
  onConnect: async (socket, ctx) => {
    // Send ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, 30000);
    
    // Store interval in context for cleanup
    ctx.metadata = { pingInterval };
  },

  onClose: async (socket, ctx) => {
    // Clear ping interval
    clearInterval(ctx.metadata?.pingInterval);
  }
});
```

### 2. Rate Limiting

```typescript
const messageCount = new Map<string, number>();

app.ws('/ws/rate-limited', {
  auth: async (ctx) => {
    return { id: ctx.query.userId as string };
  },

  onMessage: async (socket, message, ctx) => {
    const userId = ctx.user.id;
    const count = (messageCount.get(userId) || 0) + 1;
    messageCount.set(userId, count);
    
    // Reset count every minute
    setTimeout(() => {
      messageCount.set(userId, Math.max(0, (messageCount.get(userId) || 0) - 1));
    }, 60000);
    
    // Limit: 100 messages per minute
    if (count > 100) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Rate limit exceeded'
      }));
      return;
    }
    
    // Process message...
  }
});
```

### 3. Message Validation

```typescript
import { z } from 'zod';

const ChatMessageSchema = z.object({
  type: z.literal('chat'),
  room: z.string().optional(),
  text: z.string().min(1).max(1000)
});

const JoinRoomSchema = z.object({
  type: z.literal('join_room'),
  room: z.string().min(1).max(50)
});

const MessageSchema = z.discriminatedUnion('type', [
  ChatMessageSchema,
  JoinRoomSchema
]);

app.ws('/ws/validated', {
  onMessage: async (socket, message, ctx) => {
    const result = MessageSchema.safeParse(message);
    
    if (!result.success) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        errors: result.error.errors
      }));
      return;
    }
    
    const validatedMessage = result.data;
    
    // Now TypeScript knows the exact type
    switch (validatedMessage.type) {
      case 'chat':
        // validatedMessage.text is guaranteed to exist
        break;
      case 'join_room':
        // validatedMessage.room is guaranteed to exist
        break;
    }
  }
});
```

## WebSocket vs HTTP

| Feature | WebSocket | HTTP |
|---------|-----------|------|
| Connection | Persistent | Request/Response |
| Direction | Bidirectional | Client → Server |
| Overhead | Low (after handshake) | High (headers per request) |
| Use Case | Real-time, streaming | CRUD operations |
| Scaling | More complex | Easier |

**Gunakan WebSocket untuk:**
- Chat applications
- Live notifications
- Real-time dashboards
- Multiplayer games
- Collaborative editing
- Live streaming data

**Gunakan HTTP untuk:**
- CRUD operations
- File uploads
- Authentication endpoints
- One-time requests

---

**Related:**
- [03-routing.md](./03-routing.md) - HTTP Routing
- [19-class-based-routing.md](./19-class-based-routing.md) - Class-based Routes
