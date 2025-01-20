import React, { createContext, useContext, useState } from "react";
import { Ed25519KeyIdentity } from "@dfinity/identity";

interface ApprovalRequest {
  id: string;
  type: "transfer" | "connect" | "sign";
  data: any;
  origin: string;
  timestamp: number;
}

interface WalletContextType {
  identities: Ed25519KeyIdentity[];
  setIdentities: (identities: Ed25519KeyIdentity[]) => void;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  seedPhrases: string[];
  setSeedPhrases: (phrases: string[]) => void;
  approvalRequests: ApprovalRequest[];
  addApprovalRequest: (
    request: Omit<ApprovalRequest, "id" | "timestamp">,
    callback?: (approved: boolean) => void
  ) => string;
  resolveApprovalRequest: (id: string, approved: boolean) => void;
  pendingCallbacks: { [key: string]: (approved: boolean) => void };
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [identities, setIdentities] = useState<Ed25519KeyIdentity[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [seedPhrases, setSeedPhrases] = useState<string[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(
    []
  );
  const [pendingCallbacks, setPendingCallbacks] = useState<{
    [key: string]: (approved: boolean) => void;
  }>({});

  const addApprovalRequest = (
    request: Omit<ApprovalRequest, "id" | "timestamp">,
    callback?: (approved: boolean) => void
  ) => {
    const id = Math.random().toString(36).substring(7);
    const newRequest: ApprovalRequest = {
      ...request,
      id,
      timestamp: Date.now(),
    };
    setApprovalRequests((prev) => [...prev, newRequest]);
    if (callback) {
      setPendingCallbacks((prev) => ({ ...prev, [id]: callback }));
    }
    return id;
  };

  const resolveApprovalRequest = (id: string, approved: boolean) => {
    const callback = pendingCallbacks[id];
    if (callback) {
      callback(approved);
      setPendingCallbacks((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
    setApprovalRequests((prev) => prev.filter((req) => req.id !== id));
  };

  return (
    <WalletContext.Provider
      value={{
        identities,
        setIdentities,
        currentIndex,
        setCurrentIndex,
        seedPhrases,
        setSeedPhrases,
        approvalRequests,
        addApprovalRequest,
        resolveApprovalRequest,
        pendingCallbacks,
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
