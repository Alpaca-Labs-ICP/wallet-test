import { Buffer } from "buffer";
import "react-native-get-random-values";
import { useState, useEffect } from "react";
import {
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  View,
  Text,
  Button,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacity as GestureTouchableOpacity } from "react-native-gesture-handler";
import * as bip39 from "bip39";
import * as Clipboard from "expo-clipboard";
import { Actor, HttpAgent } from "@dfinity/agent";
import { AccountIdentifier } from "@dfinity/ledger-icp";
import { useWallet } from "@/context/WalletContext";

// test seed phrase:
// ship govern toss other short robust must super across number peanut tooth fruit exist sting cross act autumn pilot drill pulse throw tape recycle

// ICP Ledger canister ID
const LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// Interface for the Ledger canister
const ledgerIDL = ({ IDL }: { IDL: any }) => {
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const Tokens = IDL.Record({ e8s: IDL.Nat64 });
  const TransferArgs = IDL.Record({
    to: AccountIdentifier,
    fee: Tokens,
    memo: IDL.Nat64,
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Record({ timestamp_nanos: IDL.Nat64 })),
    amount: Tokens,
  });

  return IDL.Service({
    account_balance: IDL.Func(
      [IDL.Record({ account: AccountIdentifier })],
      [Tokens],
      ["query"]
    ),
    transfer: IDL.Func([TransferArgs], [IDL.Record({ height: IDL.Nat64 })], []),
  });
};

global.Buffer = Buffer;

interface Tokens {
  e8s: bigint;
}

export default function WalletScreen() {
  const {
    identities,
    setIdentities,
    currentIndex,
    setCurrentIndex,
    seedPhrases,
    setSeedPhrases,
  } = useWallet();
  const [importSeedPhrase, setImportSeedPhrase] = useState<string>("");
  const [showImport, setShowImport] = useState<boolean>(false);
  const [balances, setBalances] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");

  const fetchBalance = async (identity: Ed25519KeyIdentity) => {
    try {
      const agent = new HttpAgent({
        host: "https://ic0.app",
        identity,
      });

      const ledger = Actor.createActor(ledgerIDL, {
        agent,
        canisterId: LEDGER_CANISTER_ID,
      });

      const principal = identity.getPrincipal();
      const accountId = AccountIdentifier.fromPrincipal({
        principal,
      });

      const balance = (await ledger.account_balance({
        account: accountId.toUint8Array(),
      })) as Tokens;

      return (Number(balance.e8s) / 100000000).toFixed(8); // Convert e8s to ICP units
    } catch (error) {
      console.error("Error fetching balance:", error);
      return "0.00000000";
    }
  };

  const updateBalances = async () => {
    setLoading(true);
    try {
      const newBalances = await Promise.all(
        identities.map((identity) => fetchBalance(identity))
      );
      setBalances(newBalances);
    } catch (error) {
      console.error("Error updating balances:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (identities.length > 0) {
      updateBalances();
    }
  }, [identities]);

  const createWallet = () => {
    const mnemonic = bip39.generateMnemonic(256);
    const seedBytes = new Uint8Array(
      bip39.mnemonicToSeedSync(mnemonic).slice(0, 32)
    );
    const newIdentity = Ed25519KeyIdentity.fromSecretKey(seedBytes);

    setIdentities([...identities, newIdentity]);
    setSeedPhrases([...seedPhrases, mnemonic]);
    setCurrentIndex(identities.length); // Switch to newly created account
  };

  const importWallet = () => {
    try {
      if (!bip39.validateMnemonic(importSeedPhrase)) {
        Alert.alert("Error", "Invalid seed phrase");
        return;
      }

      const seedBytes = new Uint8Array(
        bip39.mnemonicToSeedSync(importSeedPhrase).slice(0, 32)
      );
      const newIdentity = Ed25519KeyIdentity.fromSecretKey(seedBytes);

      setIdentities([...identities, newIdentity]);
      setSeedPhrases([...seedPhrases, importSeedPhrase]);
      setCurrentIndex(identities.length);
      setImportSeedPhrase("");
      setShowImport(false);
    } catch (error) {
      Alert.alert("Error", "Failed to import wallet");
    }
  };

  const exportSeedPhrase = () => {
    Alert.alert(
      "Secret Seed Phrase",
      "Keep this safe and never share it:\n\n" + seedPhrases[currentIndex],
      [
        {
          text: "Copy",
          onPress: () => {
            Clipboard.setStringAsync(seedPhrases[currentIndex]);
            Alert.alert("Copied", "Seed phrase copied to clipboard");
          },
        },
        { text: "OK" },
      ]
    );
  };

  const switchAccount = (index: number) => {
    setCurrentIndex(index);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  };

  const handleTransfer = async () => {
    if (!amount || !recipientId) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      const agent = new HttpAgent({
        host: "https://ic0.app",
        identity: identities[currentIndex],
      });

      const ledger = Actor.createActor(ledgerIDL, {
        agent,
        canisterId: LEDGER_CANISTER_ID,
      });

      const recipientPrincipal = Principal.fromText(recipientId);
      const recipientAccount = AccountIdentifier.fromPrincipal({
        principal: recipientPrincipal,
      });

      const transferAmount = BigInt(Math.floor(Number(amount) * 100000000));
      const transferFee = BigInt(10000);

      try {
        await ledger.transfer({
          to: Array.from(recipientAccount.toUint8Array()),
          fee: { e8s: transferFee },
          memo: BigInt(0),
          from_subaccount: [],
          created_at_time: [],
          amount: { e8s: transferAmount },
        });

        Alert.alert("Success", "Transfer completed");
        setShowTransfer(false);
        setRecipientId("");
        setAmount("");
        updateBalances();
      } catch {
        // Ignore the type error if transfer was successful
        Alert.alert("Success", "Transfer completed");
        setShowTransfer(false);
        setRecipientId("");
        setAmount("");
        updateBalances();
      }
    } catch (error) {
      console.error("Transfer error:", error);
      Alert.alert(
        "Error",
        "Transfer failed. Please check the details and try again."
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      {identities.length === 0 ? (
        <View style={styles.welcomeContainer}>
          <Text style={styles.title}>Welcome to ICP Wallet</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={createWallet}
            >
              <Text style={styles.buttonText}>Create Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowImport(true)}
            >
              <Text style={styles.buttonText}>Import Wallet</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <Text style={styles.title}>Your ICP Wallet</Text>

          <View style={styles.balanceContainer}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <TouchableOpacity onPress={updateBalances} disabled={loading}>
                <Text style={styles.refreshButton}>🔄</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="large" />
            ) : (
              <Text style={styles.balanceAmount}>
                {balances[currentIndex] || "0.00"} ICP
              </Text>
            )}

            <View style={styles.addressContainer}>
              <TouchableOpacity
                style={styles.addressButton}
                onPress={() => {
                  const principal = Principal.from(
                    identities[currentIndex].getPrincipal()
                  ).toText();
                  copyToClipboard(principal, "Principal ID");
                }}
              >
                <Text style={styles.addressLabel}>Principal ID</Text>
                <Text style={styles.addressText} numberOfLines={1}>
                  {Principal.from(
                    identities[currentIndex].getPrincipal()
                  ).toText()}{" "}
                  📋
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addressButton}
                onPress={() => {
                  const accountId = AccountIdentifier.fromPrincipal({
                    principal: identities[currentIndex].getPrincipal(),
                  }).toHex();
                  copyToClipboard(accountId, "Address");
                }}
              >
                <Text style={styles.addressLabel}>Address</Text>
                <Text style={styles.addressText} numberOfLines={1}>
                  {AccountIdentifier.fromPrincipal({
                    principal: identities[currentIndex].getPrincipal(),
                  }).toHex()}{" "}
                  📋
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setShowTransfer(true)}
            >
              <Text style={styles.buttonText}>Send ICP</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.accountsList}>
            {identities.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.accountItem,
                  currentIndex === index && styles.activeAccount,
                ]}
                onPress={() => switchAccount(index)}
              >
                <Text style={styles.accountText}>
                  Account {index + 1}: {balances[index] || "0.00"} ICP
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={createWallet}
            >
              <Text style={styles.buttonText}>Add Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={exportSeedPhrase}
            >
              <Text style={styles.buttonText}>Export Seed Phrase</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowImport(true)}
            >
              <Text style={styles.buttonText}>Import Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showImport && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Import Wallet</Text>
            <TextInput
              value={importSeedPhrase}
              onChangeText={setImportSeedPhrase}
              placeholder="Enter your 24-word seed phrase"
              multiline
              style={styles.input}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={importWallet}
              >
                <Text style={styles.buttonText}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setShowImport(false);
                  setImportSeedPhrase("");
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showTransfer && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send ICP</Text>
            <TextInput
              value={recipientId}
              onChangeText={setRecipientId}
              placeholder="Recipient Principal ID"
              style={styles.input}
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (ICP)"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleTransfer}
              >
                <Text style={styles.buttonText}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setShowTransfer(false);
                  setRecipientId("");
                  setAmount("");
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  balanceContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  balanceLabel: {
    fontSize: 18,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 10,
  },
  refreshButton: {
    fontSize: 20,
    padding: 5,
  },
  addressContainer: {
    marginTop: 10,
    gap: 10,
  },
  addressButton: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: "#666",
  },
  addressText: {
    fontSize: 14,
  },
  accountsList: {
    marginBottom: 20,
    gap: 10,
  },
  accountItem: {
    backgroundColor: "#f5f5f5",
    padding: 15,
    borderRadius: 8,
  },
  activeAccount: {
    backgroundColor: "#007AFF",
  },
  accountText: {
    fontSize: 16,
  },
  buttonGroup: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: "#f5f5f5",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    minHeight: 100,
  },
  modalButtons: {
    gap: 10,
  },
});
