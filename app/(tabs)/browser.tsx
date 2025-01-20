import { useState, useRef } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedView } from "@/components/ThemedView";
import { Principal } from "@dfinity/principal";
import { AccountIdentifier } from "@dfinity/ledger-icp";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { useWallet } from "@/context/WalletContext";

// ICP Ledger canister ID
const LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// Interface for the Ledger canister
const ledgerIDL = ({ IDL }: { IDL: any }) => {
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const Tokens = IDL.Record({ e8s: IDL.Nat64 });
  return IDL.Service({
    account_balance: IDL.Func(
      [IDL.Record({ account: AccountIdentifier })],
      [Tokens],
      ["query"]
    ),
  });
};

interface Tokens {
  e8s: bigint;
}

export default function BrowserScreen() {
  const { identities, currentIndex } = useWallet();
  const [url, setUrl] = useState("https://google.com");
  const [currentUrl, setCurrentUrl] = useState("https://google.com");
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);

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

      return (Number(balance.e8s) / 100000000).toFixed(8);
    } catch (error) {
      console.error("Error fetching balance:", error);
      return "0.00000000";
    }
  };

  const injectedJavaScript = `
    window.paca = {
      isConnected: false,
      principal: null,
      
      requestConnect: async function() {
        return new Promise((resolve) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CONNECT_WALLET',
            source: 'paca'
          }));
          window.pacaResolve = resolve;
        });
      },

      disconnect: function() {
        this.isConnected = false;
        this.principal = null;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DISCONNECT_WALLET',
          source: 'paca'
        }));
        return true;
      },

      getPrincipal: function() {
        if (!this.isConnected) {
          throw new Error('Wallet not connected');
        }
        return this.principal;
      },

      getBalance: async function() {
        if (!this.isConnected) {
          throw new Error('Wallet not connected');
        }
        return new Promise((resolve) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'GET_BALANCE',
            source: 'paca'
          }));
          window.pacaBalanceResolve = resolve;
        });
      },

      createActor: async function(canisterId, interfaceFactory) {
        if (!this.isConnected) {
          throw new Error('Wallet not connected');
        }
        // Here we would create an actor with the wallet's identity
        // This is a placeholder for now
        return null;
      },

      requestTransfer: async function(recipient, amount) {
        if (!this.isConnected) {
          throw new Error('Wallet not connected');
        }
        return new Promise((resolve) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'REQUEST_TRANSFER',
            source: 'paca',
            data: {
              recipient,
              amount
            }
          }));
          window.pacaTransferResolve = resolve;
        });
      },
    };

    // Declare global type
    if (window.ic === undefined) {
      window.ic = {};
    }
    window.ic.paca = window.paca;
    true;
  `;

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.source !== "paca") return;

      switch (data.type) {
        case "CONNECT_WALLET":
          if (identities.length === 0) {
            webViewRef.current?.injectJavaScript(`
              window.paca.isConnected = false;
              window.pacaResolve && window.pacaResolve({ 
                connected: false,
                message: "No wallet available"
              });
            `);
            return;
          }

          const principal = Principal.from(
            identities[currentIndex].getPrincipal()
          ).toText();

          webViewRef.current?.injectJavaScript(`
            window.paca.isConnected = true;
            window.paca.principal = "${principal}";
            window.pacaResolve && window.pacaResolve({ 
              connected: true,
              principal: "${principal}"
            });
          `);
          break;

        case "GET_BALANCE":
          if (identities.length === 0) {
            throw new Error("No wallet connected");
          }
          const balance = await fetchBalance(identities[currentIndex]);
          webViewRef.current?.injectJavaScript(`
            window.pacaBalanceResolve && window.pacaBalanceResolve("${balance}");
          `);
          break;

        case "DISCONNECT_WALLET":
          webViewRef.current?.injectJavaScript(`
            window.paca.isConnected = false;
            window.paca.principal = null;
          `);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
      webViewRef.current?.injectJavaScript(`
        window.pacaResolve && window.pacaResolve({ 
          connected: false,
          message: "Connection failed"
        });
        window.pacaBalanceResolve && window.pacaBalanceResolve("0");
      `);
    }
  };

  const handleSubmit = () => {
    let formattedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      formattedUrl = `https://${url}`;
    }
    setCurrentUrl(formattedUrl);
  };

  const handleRefresh = () => {
    setWebViewKey((prev) => prev + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={handleSubmit}
          placeholder="Enter URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <IconSymbol name="chevron.right" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        key={webViewKey}
        style={styles.webview}
        source={{ uri: currentUrl }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  urlBar: {
    flexDirection: "row",
    padding: 10,
    gap: 10,
    alignItems: "center",
  },
  urlInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  refreshButton: {
    padding: 5,
  },
  webview: {
    flex: 1,
  },
});
