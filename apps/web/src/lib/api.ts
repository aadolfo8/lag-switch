import { useMutation } from '@tanstack/react-query';

export type RoomMode = 'friend' | 'bot';

async function createRoom(mode: RoomMode): Promise<{ code: string }> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`could not create a room (${res.status})`);
  return res.json();
}

/** The only HTTP call in the game; everything real-time goes over the WebSocket. */
export const useCreateRoom = () => useMutation({ mutationFn: createRoom });
