/**
 * Nexus Realtime Module
 * 
 * Optional WebSocket/Realtime integration for Nexus framework.
 * Requires `ws` as peer dependency.
 * 
 * Install: npm install ws
 * 
 * Usage:
 * import { WebSocketGateway } from '@engjts/server/realtime';
 */

export {
    WebSocketGateway,
    type WebSocketContext,
    type WebSocketRoute,
    type WebSocketRouteConfig
} from './websocket';
