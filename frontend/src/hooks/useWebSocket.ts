// useWebSocket — connects to the caregiver WebSocket and dispatches events to the store.

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

interface WsMessage {
  type: string;
  eventId?: number;
  confirmedAt?: string;
  deviceConnected?: boolean;
  medicationName?: string;
  scheduledAt?: string;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const {
    setActiveAlert,
    resolveAlert,
    patchEvent,
    setDeviceConnected,
  } = useStore();

  const connect = useCallback(() => {
    // Use relative WS path — Vite proxy handles it in dev.
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/caregiver`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data);
        switch (msg.type) {
          case 'trigger':
            setActiveAlert({
              eventId: msg.eventId!,
              medicationName: msg.medicationName ?? '',
              scheduledAt: msg.scheduledAt ?? new Date().toISOString(),
            });
            break;
          case 'completed':
            resolveAlert(msg.eventId!);
            patchEvent(msg.eventId!, 'completed');
            break;
          case 'missed':
            resolveAlert(msg.eventId!);
            patchEvent(msg.eventId!, 'missed');
            break;
          case 'status':
            setDeviceConnected(msg.deviceConnected ?? false);
            break;
        }
      } catch {
        // ignore non-JSON frames
      }
    };

    ws.onclose = () => {
      // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s.
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current++;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setActiveAlert, resolveAlert, patchEvent, setDeviceConnected]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}
