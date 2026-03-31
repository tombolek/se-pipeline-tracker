import api from './client';

export async function createInboxItem(text: string, type: 'note' | 'todo'): Promise<void> {
  await api.post('/inbox', { text, type });
}
