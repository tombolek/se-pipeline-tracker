import { useEffect, useState } from 'react';
import { listUsers } from '../api/users';
import type { User } from '../types';

// Module-level cache — one fetch per session, shared across all hook instances
let cachedUsers: User[] | null = null;
let fetchPromise: Promise<User[]> | null = null;

export function invalidateUsersCache() {
  cachedUsers = null;
  fetchPromise = null;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(cachedUsers === null);

  useEffect(() => {
    if (cachedUsers !== null) {
      setUsers(cachedUsers);
      setLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = listUsers();
    }
    fetchPromise
      .then(u => {
        cachedUsers = u;
        setUsers(u);
        setLoading(false);
      })
      .catch(() => {
        fetchPromise = null;
        setLoading(false);
      });
  }, []);

  return { users, loading };
}
