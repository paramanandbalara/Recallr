import { createContext, useContext } from 'react';
import type { Allowance, User } from '../services/account';

// The signed-in user and their plan, provided by AccessGate
export interface AccountState {
  user: User;
  allowance: Allowance;
  lowMinutesWarning: number; // Warn when less listening time than this is left
  refresh: () => Promise<void>;
  signOut: () => void;
}

export const AccountContext = createContext<AccountState | null>(null);

export const useAccount = () => {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount must be used inside AccessGate');
  return account;
};
