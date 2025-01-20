import React, { createContext, useContext, useState } from "react";
import { Ed25519KeyIdentity } from "@dfinity/identity";

interface WalletContextType {
  identities: Ed25519KeyIdentity[];
  setIdentities: (identities: Ed25519KeyIdentity[]) => void;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  seedPhrases: string[];
  setSeedPhrases: (phrases: string[]) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [identities, setIdentities] = useState<Ed25519KeyIdentity[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [seedPhrases, setSeedPhrases] = useState<string[]>([]);

  return (
    <WalletContext.Provider
      value={{
        identities,
        setIdentities,
        currentIndex,
        setCurrentIndex,
        seedPhrases,
        setSeedPhrases,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
